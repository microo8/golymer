package domrepeat

import (
	"github.com/gopherjs/gopherjs/js"
	"github.com/microo8/golymer"
)

//DomRepeat is an element that stamps and binds objects from an model
type DomRepeat struct {
	golymer.Element
	Items    []interface{}
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
		panic("dom-repeat child must be exactly one and of type template")
	}
	dr.template = children.Index(0)
}

//ObserverItems refreshes the item elements
func (dr *DomRepeat) ObserverItems(oldValue, newValue []interface{}) {
	dr.itemsInserted(0, len(newValue))
}

func (dr *DomRepeat) itemsInserted(row, count int) {
	for i, item := range dr.Items[row : row+count-1] {
		domItem := golymer.CreateElement("dom-item").(*DomItem)
		domItem.item = item
		domItem.SetTemplate(dr.template)
		shadowRoot := dr.Get("shadowRoot")
		if shadowRoot.Get("children").Length() == 0 {
			shadowRoot.Call("appendChild", domItem)
			continue
		}
		shadowRoot.Call("insertBefore", shadowRoot.Get("children").Index(row+i), domItem)
	}
}

//DomItem is the inside element of the DomRepeat
type DomItem struct {
	golymer.Element
	item interface{}
}

func newDomItem() *DomItem {
	return new(DomItem)
}

func init() {
	err := golymer.Define(newDomRepeat)
	if err != nil {
		panic(err)
	}
	err = golymer.Define(newDomItem)
	if err != nil {
		panic(err)
	}
}
