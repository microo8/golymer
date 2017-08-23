package golymer

import (
	"reflect"
	"strconv"
	"strings"

	"github.com/gopherjs/gopherjs/js"
)

func consoleError(args ...interface{}) {
	js.Global.Get("console").Call("error", args...)
}

//CustomElement the interface to create the CustomElement
type CustomElement interface {
	ConnectedCallback()
	DisconnectedCallback()
	AttributeChangedCallback(attributeName string, oldValue string, newValue string, namespace string)
	AdoptedCallback(oldDocument, newDocument interface{})
	DispatchEvent(customEvent *Event)
}

type oneWayDataBinding struct {
	str       string
	attribute *js.Object
	paths     []string
}

func (db oneWayDataBinding) setAttr(obj *js.Object) {
	value := db.str
	for _, path := range db.paths {
		fieldValue := newAttrPath(path).Get(obj)
		value = strings.Replace(value, "[["+path+"]]", fieldValue.String(), -1)
	}
	if db.attribute.Get("value") != js.Undefined {
		//if it's an attribute
		db.attribute.Set("value", value)
		//if it is an input node, also set the property
		if db.attribute.Get("ownerElement").Get("nodeName").String() == "INPUT" {
			db.attribute.Get("ownerElement").Set(db.attribute.Get("name").String(), value)
		}
		return
	}
	db.attribute.Set("data", value) //if it's an text node
}

type twoWayDataBinding struct {
	attribute        *js.Object
	path             string
	mutationObserver *js.Object
}

func (db twoWayDataBinding) setAttr(obj *js.Object) {
	value := newAttrPath(db.path).Get(obj)
	if db.attribute.Get("value").String() == value.String() {
		return
	}
	db.attribute.Set("value", value)
	//if it is an input node, also set the property
	if db.attribute.Get("ownerElement").Get("nodeName").String() == "INPUT" {
		db.attribute.Get("ownerElement").Set(db.attribute.Get("name").String(), value)
	}
}

//Element wrapper for the HTML element
type Element struct {
	*js.Object
	ObjValue           reflect.Value //custom element struct type
	Template           string
	Children           map[string]*js.Object
	oneWayDataBindings map[string][]*oneWayDataBinding
	twoWayDataBindings map[string]*twoWayDataBinding
}

//ConnectedCallback called when the element is attached to the DOM
func (e *Element) ConnectedCallback() {
	e.Call("attachShadow", map[string]interface{}{"mode": "open"})
	e.Get("shadowRoot").Set("innerHTML", e.Template)
	e.Children = make(map[string]*js.Object)
	e.oneWayDataBindings = make(map[string][]*oneWayDataBinding)
	e.twoWayDataBindings = make(map[string]*twoWayDataBinding)
	e.scanElement(e.Get("shadowRoot"))
	e.initAttributes()
}

//DisconnectedCallback called when the element is dettached from the DOM
func (e *Element) DisconnectedCallback() {
}

//AttributeChangedCallback ...
func (e *Element) AttributeChangedCallback(attributeName string, oldValue string, newValue string, namespace string) {
	//if attribute didn't change don't set the field
	if oldValue != newValue {
		exportedFieldName := toExportedFieldName(attributeName)
		path := newAttrPath(exportedFieldName)
		field, ok := path.GetField(e.ObjValue.Elem().Type())
		//field doesn't exist
		if !ok {
			return
		}
		if isDataBindingExpression(newValue) {
			return
		}
		convertedValue, err := convertJSType(field.Type, js.InternalObject(newValue))
		if err != nil {
			consoleError(
				"Error converting value in setting the property",
				path.String(),
				": (", newValue, ")",
				err,
			)
			return
		}
		e.Get("__internal_object__").Set(exportedFieldName, convertedValue)
	}
}

//AdoptedCallback ...
func (e *Element) AdoptedCallback(oldDocument, newDocument interface{}) {
}

//DispatchEvent dispatches an Event at the specified EventTarget, invoking the affected EventListeners in the appropriate order
func (e *Element) DispatchEvent(ce *Event) {
	e.Call("dispatchEvent", ce)
}

func (e *Element) scanElement(element *js.Object) {
	//find data binded attributes
	if elementAttributes := element.Get("attributes"); elementAttributes != js.Undefined {
		for i := 0; i < elementAttributes.Length(); i++ {
			attribute := elementAttributes.Index(i)
			//collect children with id
			if attribute.Get("name").String() == "id" {
				e.Children[attribute.Get("value").String()] = element
				continue
			}
			e.addOneWay(attribute, attribute.Get("value").String())
			e.addTwoWay(attribute, attribute.Get("value").String())
			if attribute.Get("name").String()[:3] == "on-" {
				e.addEventListener(attribute)
			}
		}
	}
	//find textChild with data binded value
	childNodes := element.Get("childNodes")
	for i := 0; i < childNodes.Length(); i++ {
		child := childNodes.Index(i)
		if child.Get("nodeName").String() != "#text" {
			continue
		}
		e.addOneWay(child, child.Get("data").String())
	}
	//scan children
	children := element.Get("children")
	for i := 0; i < children.Length(); i++ {
		e.scanElement(children.Index(i))
	}
}

//addOneWay gets an js Attribute object or an textNode object and its text value
//than finds all data bindings and adds it to the oneWayDataBindings map
func (e *Element) addOneWay(obj *js.Object, value string) {
	bindedPaths := oneWayFindAll(value)
	for _, bindedPath := range bindedPaths {
		e.subpropertyProxySet(bindedPath)
		db := &oneWayDataBinding{str: value, attribute: obj, paths: bindedPaths}
		e.oneWayDataBindings[bindedPath] = append(e.oneWayDataBindings[bindedPath], db)
		db.setAttr(e.Object)
	}
}

//addTwoWay gets an js Attribute object
//than finds all data bindings and adds it to the twoWayDataBindings map
func (e *Element) addTwoWay(obj *js.Object, value string) {
	//twoWayDataBinding, obj is attribute DOM object and value is in {{}}
	if obj.Get("value") == js.Undefined || value[:2] != "{{" || value[len(value)-2:] != "}}" {
		return
	}
	path := value[2 : len(value)-2]
	if _, ok := e.twoWayDataBindings[path]; ok {
		consoleError("data binding", path, "set more than once")
	}
	e.subpropertyProxySet(path)
	field, ok := newAttrPath(path).GetField(e.ObjValue.Type().Elem())
	if !ok {
		consoleError("Error: two way data binding path:", path, "field doesn't exist")
		return
	}
	if obj.Get("ownerElement").Get("nodeName").String() == "INPUT" {
		addInputListener(e.Get("__internal_object__"), field.Type, obj, newAttrPath(path))
	}
	mutationObserver := newMutationObserver(e.Get("__internal_object__"), field.Type, obj, path)
	db := &twoWayDataBinding{attribute: obj, path: path, mutationObserver: mutationObserver}
	e.twoWayDataBindings[path] = db
	db.setAttr(e.Object)
}

func (e *Element) addEventListener(attr *js.Object) {
	eventName := attr.Get("name").String()[3:]
	methodName := attr.Get("value").String()
	method := e.ObjValue.MethodByName(methodName)
	if !method.IsValid() {
		consoleError("Error on event listener", eventName, "binding, method", methodName, "doesn't exist")
		return
	}
	attr.Get("ownerElement").Call(
		"addEventListener",
		eventName,
		js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			event := &Event{Object: arguments[0]}
			in := []reflect.Value{reflect.ValueOf(event)}
			method.Call(in)
			return nil
		}))
}

//subpropertyProxySet sets an js Proxy on an subproperty path to track get and set on its properties
func (e *Element) subpropertyProxySet(bindedPathString string) {
	subpropertyPath := newAttrPath(bindedPathString)
	subpropertyPath = subpropertyPath[:len(subpropertyPath)-1]
	for ; len(subpropertyPath) > 0; subpropertyPath = subpropertyPath[:len(subpropertyPath)-1] {
		if e.subpropertyProxyAdded(subpropertyPath) {
			continue
		}
		proxy := newProxy(e.ObjValue, subpropertyPath)
		subpropertyPath.Set(js.InternalObject(e.ObjValue).Get("ptr"), proxy)
	}
}

func (e *Element) subpropertyProxyAdded(subpropertyPath attrPath) bool {
	return subpropertyPath.Get(e.Get("__internal_object__")).Get("__is_proxy__").Bool()
}

//initAttributes checks the initial values of fields that are mapped to attributes
func (e *Element) initAttributes() {
	for i := 0; i < e.ObjValue.Elem().NumField(); i++ {
		fieldType := e.ObjValue.Elem().Type().Field(i)
		if fieldType.PkgPath != "" || fieldType.Anonymous {
			continue
		}
		field := e.ObjValue.Elem().Field(i)
		e.Call("setAttribute", camelCaseToKebab(fieldType.Name), field.Interface())
	}
}

func newMutationObserver(proxy *js.Object, fieldType reflect.Type, attr *js.Object, path string) *js.Object {
	attr.Set("__attr_path__", path)
	mutationObserver := js.Global.Get("window").Get("MutationObserver").New(
		js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			newValue := attr.Get("value")
			path := newAttrPath(attr.Get("__attr_path__").String())
			convertedValue, err := convertJSType(fieldType, newValue)
			if err != nil {
				consoleError(
					"Error converting value in setting the property",
					path.String(),
					": (", newValue, ")",
					err,
				)
				return nil
			}
			if path.Get(proxy) != convertedValue {
				path.Set(proxy, convertedValue)
			}
			return nil
		}))
	mutationObserver.Call(
		"observe",
		attr.Get("ownerElement"),
		map[string]interface{}{
			"attributes":      true,
			"attributeFilter": []string{attr.Get("name").String()},
		},
	)
	return mutationObserver
}

func addInputListener(proxy *js.Object, fieldType reflect.Type, attr *js.Object, path attrPath) {
	ownerElement := attr.Get("ownerElement")
	handler := js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		attrName := attr.Get("name").String()
		path.Set(proxy, ownerElement.Get(attrName))
		return nil
	})
	ownerElement.Call("addEventListener", "change", handler)
	ownerElement.Call("addEventListener", "input", handler)
}

//newProxy creates an js Proxy object that can track what has been get or set to run dataBindings
func newProxy(customObject reflect.Value, pathPrefix attrPath) (proxy *js.Object) {
	internalCustomObject := js.InternalObject(customObject.Interface())
	subObj := internalCustomObject
	if len(pathPrefix) > 0 {
		subObj = pathPrefix.Get(subObj)
	}
	handler := map[string]interface{}{
		"get": js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			attributeName := arguments[1].String()
			if attributeName == "__is_proxy__" {
				return true
			}
			if attributeName == "__internal_object__" || attributeName == "$val" {
				return proxy
			}
			return subObj.Get(attributeName)
		}),
		"set": js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			attributeName := arguments[1].String()
			path := append(pathPrefix, attributeName)
			field, ok := path.GetField(customObject.Elem().Type())
			if !ok {
				//field doesn't exist
				return true
			}
			elem := customObject.Elem().FieldByName("Element").Interface().(Element)
			if len(pathPrefix) == 0 {
				//if it's exported and isn't a subproperty set also the tag attribute
				if field.PkgPath == "" {
					instance := subObj.Get("Element").Get("Object")
					instance.Call("setAttribute", camelCaseToKebab(attributeName), arguments[2])
				}
				if method := customObject.MethodByName("Observer" + attributeName); method.IsValid() {
					in := []reflect.Value{
						reflect.ValueOf(subObj.Get(attributeName).Interface()),
						reflect.ValueOf(arguments[2].Interface()),
					}
					method.Call(in)
				}
			}
			subObj.Set(attributeName, arguments[2])
			//sets binded attributes of the children in template
			for p, dbs := range elem.oneWayDataBindings {
				oneWayPath := newAttrPath(p)
				if !oneWayPath.StartsWith(path) {
					continue
				}
				for _, db := range dbs {
					db.setAttr(internalCustomObject)
				}
				//if a subobject with data bindings was replaced, then set an proxy
				if len(oneWayPath) > len(path) {
					elem.subpropertyProxySet(p)
				}
			}
			for p, db := range elem.twoWayDataBindings {
				twoWayPath := newAttrPath(p)
				if !twoWayPath.StartsWith(path) {
					continue
				}
				db.setAttr(internalCustomObject)
				//if a subobject with data bindings was replaced, then set an proxy
				if len(twoWayPath) > len(path) {
					elem.subpropertyProxySet(p)
				}
			}
			return true
		}),
	}
	proxy = js.Global.Get("Proxy").New(subObj, handler)
	return
}

func convertJSType(t reflect.Type, value *js.Object) (val interface{}, err error) {
	val = value.Interface()
	valString, ok := val.(string)
	if !ok {
		return
	}
	switch t.Kind() {
	case reflect.String:
		val = valString
		return
	case reflect.Bool:
		if valString == "" { //if the bool attribute is present set true
			return true, nil
		}
		if valString == "null" { //if the bool attribute was removed set false
			return false, nil
		}
		val, err = strconv.ParseBool(valString)
	case reflect.Float32:
		val, err = strconv.ParseFloat(valString, 32)
	case reflect.Float64:
		val, err = strconv.ParseFloat(valString, 64)
	case reflect.Int:
		val, err = strconv.ParseInt(valString, 10, 64)
	case reflect.Int16:
		val, err = strconv.ParseInt(valString, 10, 16)
	case reflect.Int32:
		val, err = strconv.ParseInt(valString, 10, 32)
	case reflect.Int64:
		val, err = strconv.ParseInt(valString, 10, 64)
	case reflect.Uint:
		val, err = strconv.ParseUint(valString, 10, 64)
	case reflect.Uint16:
		val, err = strconv.ParseUint(valString, 10, 16)
	case reflect.Uint32:
		val, err = strconv.ParseUint(valString, 10, 32)
	case reflect.Uint64:
		val, err = strconv.ParseUint(valString, 10, 64)
	}
	return
}

func isDataBindingExpression(val string) bool {
	if len(val) < 4 {
		return false
	}
	return (val[:2] == "{{" && val[len(val)-2:] == "}}") ||
		(val[:2] == "[[" && val[len(val)-2:] == "]]")
}
