package golymer

import (
	"fmt"
	"reflect"

	"github.com/gopherjs/gopherjs/js"
)

//CustomElement the interface to create the CustomElement
type CustomElement interface {
	ConnectedCallback()
	DisconnectedCallback()
	AttributeChangedCallback(attributeName, oldValue, newValue, namespace string)
	AdoptedCallback(oldDocument, newDocument interface{})
}

//Element ...
type Element struct {
	*js.Object
	Template string
}

//ConnectedCallback ...
func (e *Element) ConnectedCallback() {
	attr := new(js.Object)
	attr.Set("mode", "open")
	e.Object.Call("attachShadow", attr)
	e.Object.Get("shadowRoot").Set("innerHTML", e.Template)
}

//DisconnectedCallback ...
func (e *Element) DisconnectedCallback() {
	println(e, "DisconnectedCallback")
}

//AttributeChangedCallback ...
func (e *Element) AttributeChangedCallback(attributeName, oldValue, newValue, namespace string) {
	println(e, "AttributeChangedCallback", attributeName, oldValue, newValue, namespace)
}

//AdoptedCallback ...
func (e *Element) AdoptedCallback(oldDocument, newDocument interface{}) {
	println(e, "AdoptedCallback", oldDocument, newDocument)
}

//Define ...
func Define(name string, f interface{}) error {
	//test that it is a function with no attributes and one pointer result
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

	htmlElement := js.Global.Get("HTMLElement")
	object := js.Global.Get("Object")
	camelName := kebabToCamelCase(name)

	element := js.MakeFunc(func(this *js.Object, argments []*js.Object) interface{} {
		instance := js.Global.Get("Reflect").Call("construct", htmlElement, make([]interface{}, 0), js.Global.Get(camelName))

		customObject := reflect.ValueOf(f).Call(nil)[0].Interface().(CustomElement)
		customElement := js.MakeWrapper(customObject)
		customElement.Get("__internal_object__").Get("Element").Set("Object", instance)
		instance.Set("_customElement", customElement)
		for _, k := range js.Keys(customElement) {
			v := customElement.Get(k)
			instance.Set(k, v)
		}

		return instance
	})

	js.Global.Set(camelName, element)
	prototype := element.Get("prototype")
	object.Call("setPrototypeOf", prototype, htmlElement.Get("prototype"))
	object.Call("setPrototypeOf", element, htmlElement)

	getter := new(js.Object)
	getter.Set("get", js.MakeFunc(func(this *js.Object, argments []*js.Object) interface{} {
		var observedAttributes []string
		customElementType := reflect.TypeOf(f).Out(0).Elem()
		for i := 0; i < customElementType.NumField(); i++ {
			field := customElementType.Field(i)
			if field.PkgPath != "" {
				continue
			}
			observedAttributes = append(observedAttributes, camelCaseToKebab(field.Name))
		}
		return observedAttributes
	}))
	object.Call("defineProperty", element, "observedAttributes", getter)

	prototype.Set("connectedCallback", js.MakeFunc(func(this *js.Object, argments []*js.Object) interface{} {
		this.Get("_customElement").Interface().(CustomElement).ConnectedCallback()
		return nil
	}))
	prototype.Set("disconnectedCallback", js.MakeFunc(func(this *js.Object, argments []*js.Object) interface{} {
		this.Get("_customElement").Interface().(CustomElement).DisconnectedCallback()
		return nil
	}))
	prototype.Set("attributeChangedCallback", js.MakeFunc(func(this *js.Object, argments []*js.Object) interface{} {
		attributeName := argments[0].String()
		oldValue := argments[1].String()
		newValue := argments[2].String()
		namespace := argments[3].String()
		this.Get("_customElement").Interface().(CustomElement).AttributeChangedCallback(
			attributeName,
			oldValue,
			newValue,
			namespace,
		)
		return nil
	}))
	prototype.Set("adoptedCallback", js.MakeFunc(func(this *js.Object, argments []*js.Object) interface{} {
		this.Get("_customElement").Interface().(CustomElement).AdoptedCallback(
			argments[0].Interface(),
			argments[1].Interface(),
		)
		return nil
	}))

	js.Global.Get("customElements").Call("define", name, element)
	return nil
}
