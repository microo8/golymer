package main

import "github.com/microo8/golymer"

const testElemTemplate = `
<style>
	h1 {
		font-size: 50px;
	}
</style>

<h1 height="[[attrThree]]">
	<span id="meh" style="display: [[Display]];">[[AttrOne]]</span>
</h1>
`

//TestElem ...
type TestElem struct {
	golymer.Element
	AttrOne   string
	AttrTwo   int
	attrThree int
	Display   string
}

//NewTestElem ...
func NewTestElem() *TestElem {
	elem := &TestElem{}
	elem.AttrTwo = 100
	elem.Display = "block"
	elem.Template = testElemTemplate
	return elem
}

func main() {
	err := golymer.Define(NewTestElem)
	if err != nil {
		panic(err)
	}
}
