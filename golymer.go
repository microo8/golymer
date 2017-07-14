package golymer

import (
	"reflect"

	"github.com/gopherjs/gopherjs/js"
)

//CustomElement the interface to create the CustomElement
type CustomElement interface {
	GetElement() *js.Object
	SetElement(*js.Object)
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

//GetElement ...
func (e *Element) GetElement() *js.Object {
	return e.Object
}

//SetElement ...
func (e *Element) SetElement(obj *js.Object) {
	e.Object = obj
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
func Define(name string, f func() CustomElement) {
	htmlElement := js.Global.Get("HTMLElement")
	object := js.Global.Get("Object")
	camelName := kebabToCamelCase(name)
	var observedAttributes []string

	element := js.MakeFunc(func(this *js.Object, argments []*js.Object) interface{} {
		instance := js.Global.Get("Reflect").Call("construct", htmlElement, make([]interface{}, 0), js.Global.Get(camelName))
		customObject := f()
		customObject.SetElement(instance)
		customObjectType := reflect.TypeOf(customObject).Elem()
		for i := 0; i < customObjectType.NumField(); i++ {
			if field := customObjectType.Field(i); len(field.PkgPath) == 0 {
				observedAttributes = append(observedAttributes, camelCaseToKebab(field.Name))
			}
		}

		customElement := js.MakeWrapper(customObject)
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
	prototype.Set("observedAttributes", observedAttributes)

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
}
