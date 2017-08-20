# golymer
Create HTML [custom elements](https://www.w3.org/TR/custom-elements/#custom-element) with [go](https://golang.org) ([gopherjs](https://github.com/gopherjs/gopherjs))

It's unstable, things will break in the future.

contribution of all kind is welcome

With golymer you can create your own HTML custom elements, just by registering an go struct. The innerHTML of the shadowDOM has automatic data bindings to the struct fields (and fields of the struct fields ...).

```go
package main

import "github.com/microo8/golymer"

const myAwesomeTemplate = `
<style>
	:host {
		background-color: blue;
		width: 500px;
		height: [[FooAttr]]px;
	}
</style>
<p>[[privateProperty]]</p>
<input type="text" value="{{BarAttr}}"/>
`

type MyAwesomeElement struct {
	golymer.Element
	FooAttr int
	BarAttr string
	privateProperty float64
}

func NewMyAwesomeElement() *MyAwesomeElement {
	e := &MyAwesomeElement{
		FooAttr: 800,
	}
	e.Template = myAwesomeTemplate
	return e
}

func main() {
	//pass the element constructor to the Define function
	err := golymer.Define(NewMyAwesomeElement)
	if err != nil {
		panic(err)
	}
}
```

Then just run `$ gopherjs build`, import the generated script to your html `<script src="my_awesome_element.js"></script>` and you can use your new element

```html
<my-awesome-element foo-attr="1" bar-attr="hello"></my-awesome-element>
```

## define an element

To define your own custom element, you must create an struct that embeds the `golymer.Element` struct. And then an function that is the constructor for the struct. Then add the constructor to the `golymer.Define` function. This is an minimal example.:

```go
type MyElem struct {
	golymer.Element
}

func NewMyElem() *MyElem {
	return new(MyElem)
}

func init() {
	err := golymer.Define(NewMyElem)
	if err != nil {
		panic(err)
	}
}
```

The struct name, in CamelCase, is converted to the kebab-case. Because html custom elements must have at least one dash in the name, the struct name must also have at least one "hump" in the camel case name. `(MyElem -> my-elem)`. So, for example, an struct named `Foo` will not be defined and the `Define` function will return an error.

Also the constructor fuction must have an special shape. It can't take no arguments and must return an *pointer* to an struct that embeds the `golymer.Element` struct.

## template

The `innerHTML` of the `shadowDOM` in your new custom element is just an string that must be assigned to the `Element.Template` field in the constructor. eg:

```go
func NewMyElem() *MyElem {
	e := new(MyElem)
	e.Template = `
	<h1>Hello golymer</h1>
	`
	return e
}
```

The element will then have an `shadowDOM` thats `innerHTML` will be set from the `Template` field at the `connectedCallback`.

## one way data bindings

golymer has build in data bindings. One way data bindings are used for presenting an struct field's value. For defining an one way databinding you can use double square brackets with the path to the field (`[[Field]]` or `subObject.Field`) Eg:

```html
<p>[[Text]]!!!</p>
```

Where the host struct has an `Text` field. Or the name in brackets can be an path to an fielt `subObject.subSubObject.Field`. The field value este then converted to it's string representation. One way data bindings can be used in text nodes, like in the example above, and also in element attributes eg. `<div style="display: [[MyDisplay]]"></div>`

Every time the fields value is changed, the template will be automaticaly changed. Changing the `Text` fields value eg `myElem.Text = "foo"` also changes the `<p>` element's `innerHTML`.

## two way data bindings

Two way data bindings are declared with two curly brackets (`{{Field}}` or `{{subObject.Field}}`) and work only in attributes of elements in the template. So every time the elements attribute is changed, the declared struct field will also be changed. golymer makes also an workaround for html `input` elements, so it is posible to just bind to the `value` attribute.

```html
<input id="username" name="username" type="text" value="{{Username}}">
```

Changing `elem.Username` changes the `input.value`, and also changing the `input.value` or the value attribute `document.getElementById("username").setAttribute("newValue")` or the user adds some text, the `elem.Username` will be also changed.


## connecting to events

Connecting to the events of elements can created by `addEventListener` function, but it is also possible to connect some struct method with an `on-<eventName>` attribute.  

```html
<button on-click="ButtonClicked"></button>
```

```go
func (e *MyElem) ButtonClicked(event *golymer.Event) {
	print("the button was clicked!")
}
```

## custom events

golymer adds the `DispatchEvent` method so you can fire your own event.

```go
event := golymer.NewEvent(
	"custom-event",
	map[string]interface{}{
		"detail": map[string]interface{}{
			"data": "foo",
		},
		"bubbles": true,
	},
)
elem.DispatchEvent(event)
```

and these events can be also connected to:

```html
<my-second-element on-custom-event="MyCustomHandler"></my-second-element>
```

## observers

On changing an fields value, you can have an observer, that will get the old and new value of the field. It must just be an method with the name: `Observer<FieldName>`. eg:

```go
func (e *MyElem) ObserverText(oldValue, newValue string) {
	print("Text field changed from", oldValue, "to", newValue)
}
```

## children



## tips

It is possible to type assert the node object to your custom struct type.
