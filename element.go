package golymer

import (
	"reflect"
	"strconv"

	"github.com/gopherjs/gopherjs/js"
)

//CustomElement the interface to create the CustomElement
type CustomElement interface {
	ConnectedCallback()
	DisconnectedCallback()
	AttributeChangedCallback(attributeName string, oldValue string, newValue string, namespace string)
	AdoptedCallback(oldDocument, newDocument interface{})
	DispatchEvent(customEvent *Event)
}

//Element wrapper for the HTML element
type Element struct {
	*js.Object
	ObjValue reflect.Value //custom element struct type
	Children map[string]*js.Object
	template Template
	oneWay   map[string][]dataBindingSetter
	twoWay   map[string]dataBindingSetter
}

//ConnectedCallback called when the element is attached to the DOM
func (e *Element) ConnectedCallback() {
	e.Children = make(map[string]*js.Object)
	e.oneWay = make(map[string][]dataBindingSetter)
	e.twoWay = make(map[string]dataBindingSetter)
	if e.template != nil {
		e.Call("attachShadow", map[string]interface{}{"mode": "open"})
		var jsTemplate *js.Object = e.template
		clone := jsTemplate.Get("content").Call("cloneNode", true)
		e.Get("shadowRoot").Call("appendChild", clone)
		e.scanElement(e.Get("shadowRoot"))
	}
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
			panic("Error converting value in setting the property" +
				path.String() +
				": (" + newValue + ")" +
				err.Error())
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

//AddEventListener is an wrapper for the js addEventListener
func (e *Element) AddEventListener(eventName string, f func(*Event)) {
	e.Call("addEventListener", eventName, js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		f(&Event{Object: arguments[0]})
		return nil
	}))
}

//SetTemplate sets this element's template, must be called in own element's constructor, before connectedCallback
func (e *Element) SetTemplate(template Template) {
	e.template = template
}

func (e *Element) initAttributes() {
	for i := 0; i < e.ObjValue.Elem().NumField(); i++ {
		fieldType := e.ObjValue.Elem().Type().Field(i)
		if fieldType.PkgPath != "" || fieldType.Anonymous {
			continue
		}
		field := e.ObjValue.Elem().Field(i)
		//don't override the data binding
		if !isDataBindingExpression(e.Call("getAttribute", camelCaseToKebab(fieldType.Name)).String()) {
			setNodeAttribute(fieldType, e.Object, field.Interface())
		}
	}
}

func (e *Element) scanElement(element *js.Object) {
	//find data binded attributes
	if elementAttributes := element.Get("attributes"); elementAttributes != js.Undefined {
		for i := 0; i < elementAttributes.Length(); i++ {
			attribute := elementAttributes.Index(i)
			attributeName := attribute.Get("name").String()
			if attributeName == "id" {
				e.Children[attribute.Get("value").String()] = element
				continue
			}
			if attributeName[:3] == "on-" {
				e.addEventListener(attribute)
				continue
			}
			e.addOneWay(attribute, attribute.Get("value").String())
			e.addTwoWay(attribute, attribute.Get("value").String())
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
		db := &oneWaySetter{str: value, attribute: obj, paths: bindedPaths}
		e.oneWay[bindedPath] = append(e.oneWay[bindedPath], db)
		db.setAttr(e.Object)
	}
}

//addTwoWay gets an js Attribute object
//than finds all data bindings and adds it to the twoWay map
func (e *Element) addTwoWay(obj *js.Object, value string) {
	//twoWayDataBinding, obj is attribute DOM object and value is in {{}}
	if obj.Get("value") == js.Undefined || len(value) < 5 || value[:2] != "{{" || value[len(value)-2:] != "}}" {
		return
	}
	path := value[2 : len(value)-2]
	aPath := newAttrPath(path)
	field, ok := aPath.GetField(e.ObjValue.Type().Elem())
	if !ok {
		panic("Error: two way data binding path: " + path + " field doesn't exist")
	}
	if _, ok := e.twoWay[path]; ok {
		panic("data binding " + path + " set more than once")
	}
	var db dataBindingSetter
	switch field.Type.Kind() {
	case reflect.Ptr, reflect.Struct, reflect.Array, reflect.Slice, reflect.Interface:
		subElement := obj.Get("ownerElement").Get("__internal_object__")
		if subElement == js.Undefined {
			panic("cannot set two way data binding for complex data structure on a noncustom element (" + value + ")")
		}
		fieldName := toExportedFieldName(obj.Get("name").String())
		db = &twoWaySetter{path: path, setter: func(val *js.Object) {
			if subElement.Get(fieldName) != val {
				subElement.Set(fieldName, val)
			}
		}}
		subDB := &twoWaySetter{path: fieldName, setter: func(val *js.Object) {
			if aPath.Get(e.Get("__internal_object__")) != val {
				aPath.Set(e.Get("__internal_object__"), val)
			}
		}}
		//dirty subElement twoWay setting new path
		subElement.Get("Element").Get("twoWay").Set(
			"$"+fieldName,
			map[string]interface{}{"k": fieldName, "v": js.InternalObject(subDB)},
		)
	default:
		e.subpropertyProxySet(path)
		if obj.Get("ownerElement").Get("nodeName").String() == "INPUT" {
			addInputListener(e.Get("__internal_object__"), field.Type, obj, newAttrPath(path))
		}
		mutationObserver := newMutationObserver(e.Get("__internal_object__"), field.Type, obj, path)
		db = &twoWayAttrSetter{attribute: obj, path: path, mutationObserver: mutationObserver}
	}
	e.twoWay[path] = db
	db.setAttr(e.Object)
}

func (e *Element) addEventListener(attr *js.Object) {
	eventName := attr.Get("name").String()[3:]
	methodName := attr.Get("value").String()
	method := e.ObjValue.MethodByName(methodName)
	if !method.IsValid() {
		panic("Error on event listener " + eventName + " binding, method " + methodName + " doesn't exist")
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
		if e.isSubpropertyProxy(subpropertyPath) {
			continue
		}
		proxy := newProxy(e.ObjValue, subpropertyPath)
		subpropertyPath.Set(js.InternalObject(e.ObjValue).Get("ptr"), proxy)
	}
}

func (e *Element) isSubpropertyProxy(subpropertyPath attrPath) bool {
	return subpropertyPath.Get(e.Get("__internal_object__")).Get("__is_proxy__").Bool()
}

func newMutationObserver(proxy *js.Object, fieldType reflect.Type, attr *js.Object, path string) *js.Object {
	attr.Set("__attr_path__", path)
	mutationObserver := js.Global.Get("window").Get("MutationObserver").New(
		js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			newValue := attr.Get("value")
			path := newAttrPath(attr.Get("__attr_path__").String())
			convertedValue, err := convertJSType(fieldType, newValue)
			if err != nil {
				panic("Error converting value in setting the property" +
					path.String() +
					": (" + newValue.String() + ")" +
					err.Error())
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
		attributeName := attr.Get("name").String()
		path.Set(proxy, ownerElement.Get(attributeName))
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
					setNodeAttribute(field, instance, arguments[2])
				}
				if method := elem.Get("__internal_object__").Get("Observer" + attributeName); method != js.Undefined {
					method.Call("bind", elem.Get("__internal_object__")).Invoke(
						subObj.Get(attributeName),
						arguments[2],
					)
				}
			}
			subObj.Set(attributeName, arguments[2])
			//sets binded attributes of the children in template
			for p, dbs := range elem.oneWay {
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
			for p, db := range elem.twoWay {
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

func setNodeAttribute(field reflect.StructField, node *js.Object, value interface{}) {
	attributeName := camelCaseToKebab(field.Name)
	switch field.Type.Kind() {
	case reflect.Bool: //bool type just sets/unsets the attribute
		boolValue, ok := value.(bool)
		if !ok {
			boolValue = value.(*js.Object).Bool()
		}
		if boolValue {
			node.Call("setAttribute", attributeName, "")
		} else {
			node.Call("removeAttribute", attributeName)
		}
	case reflect.Ptr, reflect.Struct, reflect.Array, reflect.Slice, reflect.Interface:
		//don't set attribute if it is an complex data structure
	default:
		node.Call("setAttribute", attributeName, value)
	}
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
