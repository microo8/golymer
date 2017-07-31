package golymer

import (
	"reflect"
	"regexp"
	"strings"

	"github.com/gopherjs/gopherjs/js"
)

var oneWayRegex = regexp.MustCompile(`\[\[([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\]\]`)

//CustomElement the interface to create the CustomElement
type CustomElement interface {
	ConnectedCallback()
	DisconnectedCallback()
	AttributeChangedCallback(attributeName string, oldValue interface{}, newValue interface{}, namespace string)
	AdoptedCallback(oldDocument, newDocument interface{})
}

type oneWayDataBinding struct {
	Str       string
	Attribute *js.Object
	Paths     []attrPath
}

func (db oneWayDataBinding) SetAttr(obj *js.Object) {
	value := db.Str
	for _, path := range db.Paths {
		fieldValue := path.Get(obj).String()
		value = strings.Replace(value, "[["+path.String()+"]]", fieldValue, -1)
	}
	if db.Attribute.Get("value") != js.Undefined {
		db.Attribute.Set("value", value) //if it's an attribute
		return
	}
	db.Attribute.Set("data", value) //if it's an text node
}

type twoWayDataBinding struct {
	Attribute        *js.Object
	Path             attrPath
	MutationObserver *js.Object
}

func (db twoWayDataBinding) SetAttr(obj *js.Object) {
	if db.Attribute.Get("value").String() != db.Path.Get(obj).String() {
		db.Attribute.Set("value", db.Path.Get(obj))
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

//ConnectedCallback ...
func (e *Element) ConnectedCallback() {
	e.Call("attachShadow", map[string]interface{}{"mode": "open"})
	e.Get("shadowRoot").Set("innerHTML", e.Template)
	e.Children = make(map[string]*js.Object)
	e.oneWayDataBindings = make(map[string][]*oneWayDataBinding)
	e.twoWayDataBindings = make(map[string]*twoWayDataBinding)
	e.scanElement(e.Get("shadowRoot"))
}

//DisconnectedCallback ...
func (e *Element) DisconnectedCallback() {
}

//AttributeChangedCallback ...
func (e *Element) AttributeChangedCallback(attributeName string, oldValue interface{}, newValue interface{}, namespace string) {
	//if attribute didn't change don't set the field
	if oldValue != newValue {
		e.Get("__internal_object__").Set(toExportedFieldName(attributeName), newValue)
	}
}

//AdoptedCallback ...
func (e *Element) AdoptedCallback(oldDocument, newDocument interface{}) {
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
			e.addDataBindings(attribute, attribute.Get("value").String())
		}
	}
	//find textChild with data binded value
	childNodes := element.Get("childNodes")
	for i := 0; i < childNodes.Length(); i++ {
		child := childNodes.Index(i)
		if child.Get("nodeName").String() != "#text" {
			continue
		}
		e.addDataBindings(child, child.Get("data").String())
	}
	//scan children
	children := element.Get("children")
	for i := 0; i < children.Length(); i++ {
		e.scanElement(children.Index(i))
	}
}

//addDataBindings gets an js Attribute object or an textNode object and its text value
//than finds all data bindings and adds it to the dataBindings map
func (e *Element) addDataBindings(obj *js.Object, value string) {
	var bindedPaths []attrPath
	for _, customElementAttributeName := range oneWayRegex.FindAllStringSubmatch(value, -1) {
		bindedPaths = append(bindedPaths, newAttrPath(customElementAttributeName[1]))
	}
	for _, bindedPath := range bindedPaths {
		//set proxy object on subproperty
		subpropertyPath := bindedPath[:len(bindedPath)-1]
		if len(subpropertyPath) > 0 && !e.subpropertyProxyAdded(subpropertyPath) {
			proxy := newProxy(e.ObjValue, subpropertyPath)
			subpropertyPath.Set(js.InternalObject(e.ObjValue).Get("ptr"), proxy)
		}
		db := &oneWayDataBinding{Str: value, Attribute: obj, Paths: bindedPaths}
		e.oneWayDataBindings[bindedPath.String()] = append(e.oneWayDataBindings[bindedPath.String()], db)
		db.SetAttr(e.Object)
	}

	//twoWayDataBinding, obj is attribute DOM object and value is in {{}}
	if obj.Get("value") == js.Undefined || value[:2] != "{{" || value[len(value)-2:] != "}}" {
		return
	}
	path := newAttrPath(value[2 : len(value)-2])
	if _, ok := e.twoWayDataBindings[path.String()]; ok {
		panic("data binding " + path.String() + " set more than once")
	}
	//set proxy object on subproperty
	subpropertyPath := path[:len(path)-1]
	if len(subpropertyPath) > 0 && !e.subpropertyProxyAdded(subpropertyPath) {
		proxy := newProxy(e.ObjValue, subpropertyPath)
		subpropertyPath.Set(js.InternalObject(e.ObjValue).Get("ptr"), proxy)
	}
	mutationObserver := newMutationObserver(e.Get("__internal_object__"), obj, path)
	db := &twoWayDataBinding{Attribute: obj, Path: path, MutationObserver: mutationObserver}
	e.twoWayDataBindings[path.String()] = db
	db.SetAttr(e.Object)
}

func (e *Element) subpropertyProxyAdded(subpropertyPath attrPath) bool {
	for p := range e.oneWayDataBindings {
		subPath := newAttrPath(p)
		subPath = subPath[:len(subPath)-1]
		if subPath.String() == subpropertyPath.String() {
			return true
		}
	}
	for p := range e.twoWayDataBindings {
		subPath := newAttrPath(p)
		subPath = subPath[:len(subPath)-1]
		if subPath.String() == subpropertyPath.String() {
			return true
		}
	}
	return false
}

func newMutationObserver(proxy *js.Object, attr *js.Object, path attrPath) *js.Object {
	attr.Set("__attr_path__", path.String())
	mutationObserver := js.Global.Get("window").Get("MutationObserver").New(
		js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			newValue := attr.Get("value")
			path := newAttrPath(attr.Get("__attr_path__").String())
			if path.Get(proxy) != newValue {
				path.Set(proxy, newValue)
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
			if attributeName == "__internal_object__" || attributeName == "$val" {
				return proxy
			}
			return subObj.Get(attributeName)
		}),
		"set": js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			attributeName := arguments[1].String()
			path := append(pathPrefix, attributeName)
			field, ok := path.GetField(customObject.Elem().Type())
			//field doesn't exist
			if !ok {
				return true
			}
			convertedValue := convertJSType(field.Type, arguments[2])
			subObj.Set(attributeName, convertedValue)
			//if it's exported and isn't a subproperty set also the tag attribute
			if len(pathPrefix) == 0 && field.PkgPath == "" {
				instance := subObj.Get("Element").Get("Object")
				instance.Call("setAttribute", camelCaseToKebab(attributeName), arguments[2])
			}
			//sets binded attributes of the children in template
			elem := customObject.Elem().FieldByName("Element").Interface().(Element)
			if dbs, ok := elem.oneWayDataBindings[path.String()]; ok {
				for _, db := range dbs {
					db.SetAttr(internalCustomObject)
				}
			}
			if db, ok := elem.twoWayDataBindings[path.String()]; ok {
				print(db.Path.String(), db.Attribute, convertedValue)
				db.SetAttr(internalCustomObject)
			}
			return true
		}),
	}
	proxy = js.Global.Get("Proxy").New(subObj, handler)
	return
}
