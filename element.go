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
	} else {
		db.Attribute.Set("data", value) //if it's an text node
	}
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
	attr := new(js.Object)
	attr.Set("mode", "open")
	e.Call("attachShadow", attr)
	shadowRoot := e.Get("shadowRoot")
	shadowRoot.Set("innerHTML", e.Template)
	if e.Children == nil {
		e.Children = make(map[string]*js.Object)
	}
	if e.oneWayDataBindings == nil {
		e.oneWayDataBindings = make(map[string][]*oneWayDataBinding)
	}
	if e.twoWayDataBindings == nil {
		e.twoWayDataBindings = make(map[string]*twoWayDataBinding)
	}
	e.scanElement(shadowRoot)
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
			attributeName := attribute.Get("name").String()
			attributeValue := attribute.Get("value").String()

			//collect children with id
			if attributeName == "id" {
				id := attribute.Get("value").String()
				e.Children[id] = element
				continue
			}
			e.addDataBindings(attribute, attributeValue)
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
			subpropertyPath.Set(js.InternalObject(e.ObjValue.Elem()).Get("ptr"), js.InternalObject(proxy))
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
	mutationObserver := js.Global.Get("window").Get("MutationObserver").New(
		js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			for i := 0; i < arguments[0].Length(); i++ {
				mutationRecord := arguments[0].Index(i)
				attributeName := mutationRecord.Get("attributeName").String()
				newValue := mutationRecord.Get("target").Call("getAttribute", attributeName)
				if path.Get(e.Get("__internal_object__")) != newValue {
					path.Set(e.Get("__internal_object__"), newValue)
				}
			}
			return nil
		}))
	mutationObserver.Call(
		"observe",
		obj.Get("ownerElement"),
		map[string]interface{}{
			"attributes":      true,
			"attributeFilter": []string{obj.Get("name").String()},
		},
	)

	//set proxy object on subproperty
	subpropertyPath := path[:len(path)-1]
	if len(subpropertyPath) > 0 && !e.subpropertyProxyAdded(subpropertyPath) {
		proxy := newProxy(e.ObjValue, subpropertyPath)
		subpropertyPath.Set(js.InternalObject(e.ObjValue.Elem()).Get("ptr"), js.InternalObject(proxy))
	}

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

//newProxy creates an js Proxy object that can track what has been get or set to run dataBindings
func newProxy(customObject reflect.Value, pathPrefix attrPath) (proxy *js.Object) {
	handler := map[string]interface{}{
		"get": js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			attributeName := arguments[1].String()
			path := append(pathPrefix, attributeName)
			if attributeName == "__internal_object__" || attributeName == "$val" {
				return proxy
			}
			return path.Get(arguments[0].Get("__internal_object__"))
		}),
		"set": js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			attributeName := arguments[1].String()
			path := append(pathPrefix, attributeName)
			if len(pathPrefix) > 0 {
				print("SUBPROPERTY SETTER!!!", path.String(), arguments[2].Interface())
			}
			field, ok := path.GetField(customObject.Elem().Type())
			//field doesn't exist
			if !ok {
				return true
			}
			convertedValue := convertJSType(field.Type, arguments[2])
			path.Set(arguments[0].Get("__internal_object__"), convertedValue)
			//if it's exported and isn't a subproperty set also the tag attribute
			if len(pathPrefix) == 0 && field.PkgPath == "" {
				instance := arguments[0].Get("__internal_object__").Get("Element").Get("Object")
				instance.Call("setAttribute", camelCaseToKebab(attributeName), arguments[2])
			}
			//sets binded attributes of the children in template
			elem := customObject.Elem().FieldByName("Element").Interface().(Element)
			if dbs, ok := elem.oneWayDataBindings[attributeName]; ok {
				for _, db := range dbs {
					db.SetAttr(proxy)
				}
			}
			if db, ok := elem.twoWayDataBindings[attributeName]; ok {
				db.SetAttr(proxy)
			}
			return true
		}),
	}
	proxy = js.Global.Get("Proxy").New(js.MakeWrapper(customObject.Interface()), handler)
	return
}
