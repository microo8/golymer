package main

import "github.com/microo8/golymer"

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

func main() {
	err := golymer.Define(NewTestElem)
	if err != nil {
		panic(err)
	}
}
