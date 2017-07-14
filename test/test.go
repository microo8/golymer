package main

import "github.com/microo8/golymer"

const testElemTemplate = `
<style>
	h1 {
		font-size: 50px;
	}
</style>

<h1>
	<span>TEST</span>
</h1>
`

//TestElem ...
type TestElem struct {
	golymer.Element
	ExportedAttribute   string
	unexportedAttribute int
}

//NewTestElem ...
func NewTestElem() golymer.CustomElement {
	elem := &TestElem{}
	elem.Template = testElemTemplate
	return elem
}

func main() {
	golymer.Define("my-element", NewTestElem)
}
