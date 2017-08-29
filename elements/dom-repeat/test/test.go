package main

import (
	"github.com/microo8/golymer"
	_ "github.com/microo8/golymer/elements/dom-repeat"
)

var testDomRepeatTemplate = golymer.NewTemplate(`
<dom-repeat items="{{Data}}">
	<template>
		<div>[[item.X]]</div>
		<div>[[item.Y]]</div>
	</template>
</dom-repeat>
`)

type item struct {
	X, Y int
}

//TestDomRepeat ...
type TestDomRepeat struct {
	golymer.Element
	Data []*item
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
}

func main() {}
