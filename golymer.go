package golymer

import (
	"fmt"
	"reflect"
	"strings"

	"github.com/gopherjs/gopherjs/js"
)

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
		this.Get("__internal_object__").Interface().(CustomElement).ConnectedCallback()
		return nil
	}))
	prototype.Set("disconnectedCallback", js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		this.Get("__internal_object__").Interface().(CustomElement).DisconnectedCallback()
		return nil
	}))
	prototype.Set("attributeChangedCallback", js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		this.Get("__internal_object__").Interface().(CustomElement).AttributeChangedCallback(
			arguments[0].String(),
			arguments[1].String(),
			arguments[2].String(),
			arguments[3].String(),
		)
		return nil
	}))
	prototype.Set("adoptedCallback", js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		this.Get("__internal_object__").Interface().(CustomElement).AdoptedCallback(
			arguments[0].Interface(),
			arguments[1].Interface(),
		)
		return nil
	}))
}

//newCustomObjectProxy creates an js Proxy object that can track what has been get or set to run dataBindings
func newCustomObjectProxy(customObject reflect.Value) (proxy *js.Object) {
	handler := map[string]interface{}{
		"get": js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			if arguments[1].String() == "__internal_object__" || arguments[1].String() == "$val" {
				return proxy
			}
			return arguments[0].Get("__internal_object__").Get(arguments[1].String())
		}),
		"set": js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			attributeName := arguments[1].String()
			field, ok := customObject.Elem().Type().FieldByName(attributeName)
			//field doesn't exist
			if !ok {
				return true
			}
			arguments[0].Get("__internal_object__").Set(attributeName, arguments[2])
			//if it's exported set also the tag attribute
			if field.PkgPath == "" {
				arguments[0].Get("__internal_object__").Get("Element").Get("Object").Call("setAttribute", camelCaseToKebab(attributeName), arguments[2])
			}
			//sets binded attributes of the children in template
			elem := customObject.Elem().FieldByName("Element").Interface().(Element)
			if dbs, ok := elem.oneWayDataBindings[attributeName]; ok {
				for _, db := range dbs {
					db.SetAttr(proxy)
				}
			}
			return true
		}),
	}
	proxy = js.Global.Get("Proxy").New(js.MakeWrapper(customObject.Interface()), handler)
	return
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
	customElementType := reflect.TypeOf(f).Out(0).Elem()
	customElementFields := getStructFields(customElementType)

	element := js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
		instance := js.Global.Get("Reflect").Call(
			"construct",
			htmlElement,
			make([]interface{}, 0),
			js.Global.Get(customElementType.Name()),
		)
		customObject := reflect.ValueOf(f).Call(nil)[0]
		customObject.Elem().FieldByName("Element").FieldByName("Object").Set(reflect.ValueOf(instance))
		customObjectProxy := newCustomObjectProxy(customObject)
		instance.Set("__internal_object__", customObjectProxy)
		instance.Set("$var", customObjectProxy)
		return instance
	})

	js.Global.Set(customElementType.Name(), element)
	prototype := element.Get("prototype")
	object.Call("setPrototypeOf", prototype, htmlElement.Get("prototype"))
	object.Call("setPrototypeOf", element, htmlElement)

	//getters and setters of the customElement
	for _, field := range customElementFields {
		field := field
		gs := map[string]interface{}{
			"get": js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
				return this.Get("__internal_object__").Get(field.Name)
			}),
			"set": js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
				//if the field is exported than the element attribute is also set
				if field.PkgPath == "" {
					this.Call("setAttribute", camelCaseToKebab(field.Name), arguments[0])
				} else {
					this.Get("__internal_object__").Set(field.Name, arguments[0])
				}
				return arguments[0]
			}),
		}
		object.Call("defineProperty", prototype, field.Name, gs)
	}

	//observedAttributes getter
	object.Call("defineProperty", element, "observedAttributes", map[string]interface{}{
		"get": js.MakeFunc(func(this *js.Object, arguments []*js.Object) interface{} {
			var observedAttributes []string
			for _, field := range customElementFields {
				//if it's an exported attribute, add it to observedAttributes
				if field.PkgPath != "" {
					continue
				}
				observedAttributes = append(observedAttributes, camelCaseToKebab(field.Name))
			}
			return observedAttributes
		}),
	})

	setPrototypeCallbacks(prototype)

	js.Global.Get("customElements").Call("define", camelCaseToKebab(customElementType.Name()), element)
	return nil
}
