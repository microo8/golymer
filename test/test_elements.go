package main

import (
	"github.com/microo8/golymer"
)

const testElemTemplate = `
<style>
	:host {
		display: block;
		box-shadow: 0px 6px 10px #000;
		height: [[height]]px;
	}

	h1 {
		font-size: 100px;
	}
</style>

<h1 id="heading" height="{{Value}}" int="{{intValue2}}" on-click="Click">
	<span id="meh" style="background-color: [[BackgroundColor]];">[[content]]</span>
</h1>
<test-elem-two id="two" display="[[Display]]" counter="{{intValue}}" on-custom-event="CustomEventHandler" obj="{{Obj}}" obj2="{{Obj2}}">
	<p id="slotChild">slot</p>
</test-elem-two>

<form>
	<h2 id="formHeading">[[inputObject.Heading]]</h2>
	<h2 id="formHeading2">[[inputObject.Heading]]</h2>
	<input id="inputName" type="text" value="{{inputObject.Name}}">
	<input id="inputAge" type="number" value="{{inputObject.Age}}">
	<input id="inputActive" type="checkbox" checked="{{inputObject.Active}}">

	<div id="divName" value="{{divObject.Name}}">[[divObject.Name]]</div>
	<div id="divAge" value="{{divObject.Age}}">[[divObject.Age]]</div>
	<div id="divActive" checked="{{divObject.Active}}">[[divObject.Active]]</div>
</form>
`

//TestElem ...
type TestElem struct {
	golymer.Element
	content               string
	height                int
	Display               string
	BackgroundColor       string
	Value                 string
	intValue              int
	intValue2             int
	inputObject           *TestDataObject
	divObject             *TestDataObject
	HeadingClicked        bool
	Observe               string `observer:"observerObserve"`
	Observe2              string
	CustomEventDispatched bool
	CustomEventDetail     string
	Obj                   *Obj
	Obj2                  *Obj
}

//Click ...
func (te *TestElem) Click(event *golymer.Event) {
	te.HeadingClicked = true
}

//ObserverObserve observer for the Observe field
func (te *TestElem) ObserverObserve(oldValue, newValue string) {
	te.Observe2 = newValue
}

//CustomEventHandler handles the custom event dispatched from the test-elem-two
func (te *TestElem) CustomEventHandler(event *golymer.Event) {
	te.CustomEventDetail = event.Detail["custom"].(string)
	te.CustomEventDispatched = true
}

//NewTestElem ...
func NewTestElem() *TestElem {
	elem := &TestElem{
		content:         "Hello world!",
		height:          100,
		Display:         "block",
		BackgroundColor: "red",
		inputObject: &TestDataObject{
			Age:    28,
			Name:   "John",
			Active: true,
		},
		divObject: &TestDataObject{
			Age:    28,
			Name:   "John",
			Active: true,
		},
		Obj: &Obj{
			id: 1,
		},
	}
	elem.Template = testElemTemplate
	return elem
}

//TestDataObject ...
type TestDataObject struct {
	Heading string
	Age     int
	Name    string
	Active  bool
}

//Obj for testing object passing between elements trough twoWayDataBindings
type Obj struct {
	id int
}

//TestElemTwo ...
type TestElemTwo struct {
	golymer.Element
	Display string
	Value   string
	Counter int
	Obj     *Obj
	Obj2    *Obj
}

//NewTestElemTwo ...
func NewTestElemTwo() *TestElemTwo {
	elem := &TestElemTwo{
		Display: "none",
		Value:   "foobar",
	}
	elem.Template = `
	<style>
		:host {
			display: [[Display]];
			background-color: red;
			width: 10vw;
			height: 10vh;
		}
	</style>
	test-elem-two
	<slot></slot>
	`
	return elem
}

func main() {
	err := golymer.Define(NewTestElem)
	if err != nil {
		panic(err)
	}
	err = golymer.Define(NewTestElemTwo)
	if err != nil {
		panic(err)
	}
}
