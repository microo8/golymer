package main

import (
	"github.com/microo8/golymer"
	"github.com/microo8/golymer/elements/dom-repeat"
)

var itemTemplate = golymer.NewTemplate(`
<div>[[Item.X]]</div>
<div>[[Item.Y]]</div>
`)

//TestItem ...
type TestItem struct {
	golymer.Element
	Item *item
}

func newTestItem() *TestItem {
	te := new(TestItem)
	te.SetTemplate(itemTemplate)
	return te
}

var testDomRepeatTemplate = golymer.NewTemplate(`
<dom-repeat id="repeat" items="{{Data}}" delegate="test-item"></dom-repeat>
`)

type item struct {
	X, Y int
}

//TestDomRepeat ...
type TestDomRepeat struct {
	golymer.Element
	Data   []*item
	repeat *domrepeat.DomRepeat
}

func newTestDomRepeat() *TestDomRepeat {
	e := new(TestDomRepeat)
	e.SetTemplate(testDomRepeatTemplate)
	e.Data = []*item{
		&item{1, 2},
		&item{2, 3},
	}
	return e
}

func init() {
	err := golymer.Define(newTestDomRepeat)
	if err != nil {
		panic(err)
	}
	err = golymer.Define(newTestItem)
	if err != nil {
		panic(err)
	}
}

func main() {}
