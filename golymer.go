package golymer

import (
	"fmt"
	"reflect"
	"regexp"
	"strings"

	"github.com/gopherjs/gopherjs/js"
)

var oneWayDataBinding = regexp.MustCompile(`\[\[([A-Za-z0-9_]*)\]\]`)

//CustomElement the interface to create the CustomElement
type CustomElement interface {
	ConnectedCallback()
	DisconnectedCallback()
	AttributeChangedCallback(attributeName, oldValue, newValue, namespace string)
	AdoptedCallback(oldDocument, newDocument interface{})
}

type dataBinding struct {
	Str       string
	Attribute *js.Object
	Fields    []string
}

func (db dataBinding) SetAttr(obj *js.Object) {
	value := db.Str
	for _, f := range db.Fields {
		fieldValue := obj.Get("_customElement").Get("__internal_object__").Get(f).String()
		value = strings.Replace(value, "[["+f+"]]", fieldValue, -1)
	}
	db.Attribute.Set("value", value)
}

//Element wrapper for the HTML element
type Element struct {
	*js.Object
	Template     string
	Children     map[string]*js.Object
	dataBindings map[string][]*dataBinding
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
	if e.dataBindings == nil {
		e.dataBindings = make(map[string][]*dataBinding)
	}
	e.scanElement(shadowRoot)
}

//DisconnectedCallback ...
func (e *Element) DisconnectedCallback() {
	println(e, "DisconnectedCallback")
}

//AttributeChangedCallback ...
func (e *Element) AttributeChangedCallback(attributeName, oldValue, newValue, namespace string) {
	e.Get("_customElement").Get("__internal_object__").Set(strings.Title(kebabToCamelCase(attributeName)), newValue)

}

//AdoptedCallback ...
func (e *Element) AdoptedCallback(oldDocument, newDocument interface{}) {
	println(e, "AdoptedCallback", oldDocument, newDocument)
}

func (e *Element) scanElement(element *js.Object) {
	elementAttributes := element.Get("attributes")
	if elementAttributes != js.Undefined {
		for i := 0; i < elementAttributes.Get("length").Int(); i++ {
			attribute := elementAttributes.Index(i)
			attributeName := attribute.Get("name").String()
			attributeValue := attribute.Get("value").String()

			//collect children with id
			if attributeName == "id" {
				id := attribute.Get("value").String()
				e.Children[id] = element
				continue
			}

			//check if the attribute's value must be binded to some elements attribute
			var bindedFields []string
			for _, customElementAttributeName := range oneWayDataBinding.FindAllStringSubmatch(attributeValue, -1) {
				bindedFields = append(bindedFields, customElementAttributeName[1])
			}
			for _, bindedField := range bindedFields {
				db := &dataBinding{Str: attributeValue, Attribute: attribute, Fields: bindedFields}
				e.dataBindings[bindedField] = append(e.dataBindings[bindedField], db)
				db.SetAttr(e.Object)
			}
		}
	}

	//scan children
	children := element.Get("children")
	for i := 0; i < children.Get("length").Int(); i++ {
		e.scanElement(children.Index(i))
	}
}

//testConstructorFunction tests that it is a function with no attributes and one pointer result
func testConstructorFunction(f interface{}) error {
	if reflect.ValueOf(f).Kind() != reflect.Func {
		return fmt.Errorf("Define Error: provided f parameter is not a function (it must be func()*YourElemType)")
	}
	if reflect.TypeOf(f).NumOut() != 1 {
		return fmt.Errorf("Define Error: provided function doesn't have one result value (it must be func()*YourElemType)")
	}
	if reflect.TypeOf(f).Out(0).Kind() != reflect.Ptr {
		return fmt.Errorf("Define Error: provided function doesn't return an pointer (it must be func()*YourElemType)")
	}
	if elemStruct, ok := reflect.TypeOf(f).Out(0).Elem().FieldByName("Element"); !ok || elemStruct.Type.Name() != "Element" {
		return fmt.Errorf("Define Error: provided function doesn't return an struct that has embedded golymer.Element struct (it must be func()*YourElemType)")
	}
	if strings.Index(camelCaseToKebab(reflect.TypeOf(f).Out(0).Elem().Name()), "-") == -1 {
		return fmt.Errorf("Define Error: name of the struct type MUST have two words in camel case eg. MyElement will be converted to tag name my-element (it must be func()*YourElemType)")
	}
	return nil
}

//getStructFields returns fields of the provided struct
func getStructFields(customElementType reflect.Type) (customElementFields []reflect.StructField) {
	for i := 0; i < customElementType.NumField(); i++ {
		field := customElementType.Field(i)
		customElementFields = append(customElementFields, field)
	}
	return
}

//setPrototypeCallbacks sets callbacks of CustomElements v1 (connectedCallback, disconnectedCallback, attributeChangedCallback and adoptedCallback)
func setPrototypeCallbacks(prototype *js.Object) {
	prototype.Set("connectedCallback", js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		this.Get("_customElement").Interface().(CustomElement).ConnectedCallback()
		return nil
	}))
	prototype.Set("disconnectedCallback", js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		this.Get("_customElement").Interface().(CustomElement).DisconnectedCallback()
		return nil
	}))
	prototype.Set("attributeChangedCallback", js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		this.Get("_customElement").Interface().(CustomElement).AttributeChangedCallback(
			arguments[0].String(),
			arguments[1].String(),
			arguments[2].String(),
			arguments[3].String(),
		)
		return nil
	}))
	prototype.Set("adoptedCallback", js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		this.Get("_customElement").Interface().(CustomElement).AdoptedCallback(
			arguments[0].Interface(),
			arguments[1].Interface(),
		)
		return nil
	}))
}

//Define registers an new custom element
//takes the constructor of the element func()*YourElemType
//element is registered under the name converted from your element type (YourElemType -> your-elem-type)
func Define(f interface{}) error {
	err := testConstructorFunction(f)
	if err != nil {
		return err
	}

	htmlElement := js.Global.Get("HTMLElement")
	object := js.Global.Get("Object")
	customElementTypeName := reflect.TypeOf(f).Out(0).Elem().Name()

	element := js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		instance := js.Global.Get("Reflect").Call(
			"construct",
			htmlElement,
			make([]interface{}, 0),
			js.Global.Get(customElementTypeName),
		)
		customObject := reflect.ValueOf(f).Call(nil)[0].Interface().(CustomElement)
		customElement := js.MakeWrapper(customObject)
		customElement.Get("__internal_object__").Get("Element").Set("Object", instance)
		instance.Set("_customElement", customElement)
		return instance
	})

	js.Global.Set(customElementTypeName, element)
	prototype := element.Get("prototype")
	object.Call("setPrototypeOf", prototype, htmlElement.Get("prototype"))
	object.Call("setPrototypeOf", element, htmlElement)

	customElementType := reflect.TypeOf(f).Out(0).Elem()
	customElementFields := getStructFields(customElementType)

	//getters and setters of the customElement
	for _, field := range customElementFields {
		field := field
		gs := new(js.Object)
		gs.Set("get", js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			return this.Get("_customElement").Get("__internal_object__").Get(field.Name)
		}))
		gs.Set("set", js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			//if the field is exported than the element attribute is also set
			if field.PkgPath == "" {
				this.Call("setAttribute", camelCaseToKebab(field.Name), arguments[0])
			} else {
				this.Get("_customElement").Get("__internal_object__").Set(field.Name, arguments[0])
			}

			//sets binded attributes of the children in template
			customElement := this.Get("_customElement").Interface()
			elem := reflect.ValueOf(customElement).Elem().FieldByName("Element").Interface().(Element)
			if dbs, ok := elem.dataBindings[field.Name]; ok {
				for _, db := range dbs {
					db.SetAttr(this)
				}
			}
			return arguments[0]
		}))
		object.Call("defineProperty", prototype, field.Name, gs)
	}

	//observedAttributes getter
	getter := new(js.Object)
	getter.Set("get", js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		var observedAttributes []string
		for _, field := range customElementFields {
			//if it's an exported attribute, add it to observedAttributes
			if field.PkgPath != "" {
				continue
			}
			observedAttributes = append(observedAttributes, camelCaseToKebab(field.Name))
		}
		return observedAttributes
	}))
	object.Call("defineProperty", element, "observedAttributes", getter)

	setPrototypeCallbacks(prototype)

	js.Global.Get("customElements").Call("define", camelCaseToKebab(customElementTypeName), element)
	return nil
}
