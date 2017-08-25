package domrepeat

import (
	"container/list"

	"github.com/gopherjs/gopherjs/js"
	"github.com/microo8/golymer"
)

//DomRepeat is an element that stamps and binds objects from an model
type DomRepeat struct {
	golymer.Element
	*list.List
	template *js.Object
}

func newDomRepeat() *DomRepeat {
	return new(DomRepeat)
}

//ConnectedCallback gets the template child
func (dr *DomRepeat) ConnectedCallback() {
	dr.Element.ConnectedCallback()
	dr.Call("attachShadow", map[string]interface{}{"mode": "open"})
	children := dr.Get("children")
	if children.Length() != 1 || children.Index(0).Get("nodeName").String() != "TEMPLATE" {
		print(dr.Element.Get("Object"))
		panic("dom-repeat child must be exactly one and of type template")
	}
	dr.template = children.Index(0)
}

func (dr *DomRepeat) ObserverList(oldValue, newValue *list.List) {
	print(oldValue, newValue)
}

func init() {
	err := golymer.Define(newDomRepeat)
	if err != nil {
		panic(err)
	}
}
