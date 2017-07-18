package main

import (
	"github.com/gopherjs/gopherjs/js"
	"github.com/microo8/golymer"
)

const testElemTemplate = `
<style>
	:host {
		display: flex;
	}

	h1 {
		font-size: 50px;
	}
</style>

<h1 height="[[height]]">
	<span id="meh" style="display: [[Display]]; background-color: [[BackgroundColor]];">[[content]]</span>
</h1>
`

//TestElem ...
type TestElem struct {
	golymer.Element
	content         string
	height          int
	Display         string
	BackgroundColor string
}

//NewTestElem ...
func NewTestElem() *TestElem {
	elem := &TestElem{
		height:          100,
		Display:         "block",
		BackgroundColor: "red",
	}
	elem.Template = testElemTemplate
	return elem
}

func load() {
	testElem := js.Global.Get("document").Call("querySelector", "test-elem").Get("_customElement").Interface().(*TestElem)
	testElem.BackgroundColor = "yellow"
	if testElem.Get("style").Get("background-color").String() != "yellow" {
		println("Error: background-color not set to yellow")
	}
}

func main() {
	err := golymer.Define(NewTestElem)
	if err != nil {
		panic(err)
	}
	js.Global.Set("load", load)
}
