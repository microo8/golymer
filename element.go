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

//attrPath is used as a path to subproperties of an js.Object
//eg obj.attr.subAttr
type attrPath []string

func newAttrPath(str string) attrPath {
	return strings.Split(str, ".")
}

//Get returns the js.Object in the attrPath
func (ap attrPath) Get(obj *js.Object) *js.Object {
	result := obj
	for _, attrName := range ap {
		result = result.Get(attrName)
	}
	return result
}

//Set sets the new value to the object attrPath
//eg. obj.attr.subAttr = value
func (ap attrPath) Set(obj *js.Object, value interface{}) {
	attr := obj
	for _, attrName := range ap[:len(ap)-1] {
		attr = attr.Get(attrName)
	}
	attr.Set(ap[len(ap)-1], value)
}

//String returns an string representation of the path
func (ap attrPath) String() string {
	return strings.Join(ap, ".")
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
	objType            reflect.Type //custom element struct type
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
	elementAttributes := element.Get("attributes")
	if elementAttributes != js.Undefined {
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
		db := &oneWayDataBinding{Str: value, Attribute: obj, Paths: bindedPaths}
		e.oneWayDataBindings[bindedPath.String()] = append(e.oneWayDataBindings[bindedPath.String()], db)
		if len(bindedPath) > 1 {
			e.setProxyPath(bindedPath[:len(bindedPath)-1])
		}
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
	db := &twoWayDataBinding{Attribute: obj, Path: path, MutationObserver: mutationObserver}
	e.twoWayDataBindings[path.String()] = db
	db.SetAttr(e.Object)
}

//setProxyPath wraps the subproperty in an Proxy object, to detect setting an field on it
func (e *Element) setProxyPath(path attrPath) {
	var proxy *js.Object
	handler := map[string]interface{}{
		"get": js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			if arguments[1].String() == "__internal_object__" || arguments[1].String() == "$val" {
				return proxy
			}
			return arguments[0].Get("__internal_object__").Get(arguments[1].String())
		}),
		"set": js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			attributeName := arguments[1].String()
			print(attributeName)
			return true
		}),
	}
	print(handler)
	//proxy = js.Global.Get("Proxy").New(js.MakeWrapper(customObject.Interface()), handler)
}
