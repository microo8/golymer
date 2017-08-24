package golymer

import "github.com/gopherjs/gopherjs/js"

//Template is an html template element ant it's used to instantite new golymer.Element shadowDOM
type Template *js.Object

//NewTemplate creates an template element
func NewTemplate(str string) Template {
	template := js.Global.Get("document").Call("createElement", "template")
	template.Set("innerHTML", str)
	return template
}
