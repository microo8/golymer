package main

import (
	"container/list"

	"github.com/microo8/golymer"
	_ "github.com/microo8/golymer/elements/dom-repeat"
)

var testDomRepeatTemplate = golymer.NewTemplate(`
<dom-repeat list="{{Data}}">
	<template>
		<div>{{item.X}}</div>
		<div>{{item.Y}}</div>
	</template>
</dom-repeat>
`)

type item struct {
	X, Y int
}

type TestDomRepeat struct {
	golymer.Element
	Data *list.List
}

func newTestDomRepeat() *TestDomRepeat {
	e := new(TestDomRepeat)
	e.SetTemplate(testDomRepeatTemplate)
	e.Data = list.New()
	e.Data.PushFront(&item{1, 2})
	return e
}

func init() {
	err := golymer.Define(newTestDomRepeat)
	if err != nil {
		panic(err)
	}
}

func main() {}
