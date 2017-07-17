package main

import "github.com/microo8/golymer"

const testElemTemplate = `
<style>
	h1 {
		font-size: 50px;
	}
</style>

<h1>
	<span id="meh">[[A]]</span>
	<span>[[C]]</span>
</h1>
`

//TestElem ...
type TestElem struct {
	golymer.Element
	AttrOne   string
	AttrTwo   int
	attrThree int
}

//NewTestElem ...
func NewTestElem() *TestElem {
	elem := &TestElem{}
	elem.Template = testElemTemplate
	return elem
}

func main() {
	err := golymer.Define(NewTestElem)
	if err != nil {
		panic(err)
	}
}
