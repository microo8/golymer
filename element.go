package golymer

import (
	"regexp"
	"strings"

	"github.com/gopherjs/gopherjs/js"
)

var oneWayRegex = regexp.MustCompile(`\[\[([A-Za-z0-9_]*)\]\]`)

//CustomElement the interface to create the CustomElement
type CustomElement interface {
	ConnectedCallback()
	DisconnectedCallback()
	AttributeChangedCallback(attributeName, oldValue, newValue, namespace string)
	AdoptedCallback(oldDocument, newDocument interface{})
}

type oneWayDataBinding struct {
	Str       string
	Attribute *js.Object
	Fields    []string
}

func (db oneWayDataBinding) SetAttr(obj *js.Object) {
	value := db.Str
	for _, f := range db.Fields {
		fieldValue := obj.Get(f).String()
		value = strings.Replace(value, "[["+f+"]]", fieldValue, -1)
	}
	if db.Attribute.Get("value") != js.Undefined {
		db.Attribute.Set("value", value) //if it's an attribute
	} else {
		db.Attribute.Set("data", value) //if it's an text node
	}
}

type twoWayDataBinding struct {
	Attribute        *js.Object
	Field            string
	MutationObserver *js.Object
}

func (db twoWayDataBinding) SetAttr(obj *js.Object) {
	db.Attribute.Set("value", obj.Get(db.Field))
}

//Element wrapper for the HTML element
type Element struct {
	*js.Object
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
	println(e, "DisconnectedCallback")
}

//AttributeChangedCallback ...
func (e *Element) AttributeChangedCallback(attributeName, oldValue, newValue, namespace string) {
	//if attribute didn't change don't set the field
	if newValue != e.Get("__internal_object__").Get(toExportedFieldName(attributeName)).String() {
		e.Get("__internal_object__").Set(toExportedFieldName(attributeName), newValue)
	}
}

//AdoptedCallback ...
func (e *Element) AdoptedCallback(oldDocument, newDocument interface{}) {
	println(e, "AdoptedCallback", oldDocument, newDocument)
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
	var bindedFields []string
	for _, customElementAttributeName := range oneWayRegex.FindAllStringSubmatch(value, -1) {
		bindedFields = append(bindedFields, customElementAttributeName[1])
	}
	for _, bindedField := range bindedFields {
		db := &oneWayDataBinding{Str: value, Attribute: obj, Fields: bindedFields}
		e.oneWayDataBindings[bindedField] = append(e.oneWayDataBindings[bindedField], db)
		db.SetAttr(e.Object)
	}
	//twoWayDataBinding, obj is attribute DOM object and value is in {{}}
	if obj.Get("value") == js.Undefined || value[:2] != "{{" || value[len(value)-2:] != "}}" {
		return
	}
	fieldName := value[2 : len(value)-2]
	mutationObserver := js.Global.Get("window").Get("MutationObserver").New(js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		for i := 0; i < arguments[0].Length(); i++ {
			mutationRecord := arguments[0].Index(i)
			attributeName := mutationRecord.Get("attributeName").String()
			newValue := mutationRecord.Get("target").Call("getAttribute", attributeName)
			e.Get("__internal_object__").Set(fieldName, newValue)
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
	db := &twoWayDataBinding{Attribute: obj, Field: fieldName, MutationObserver: mutationObserver}
	e.twoWayDataBindings[fieldName] = db
	db.SetAttr(e.Object)
}
