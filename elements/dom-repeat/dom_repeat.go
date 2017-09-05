package domrepeat

import (
	"reflect"

	"github.com/gopherjs/gopherjs/js"
	"github.com/microo8/golymer"
)

//thing about better package/elem name because domrepeat.DomRepeat is not great :/

//DomRepeat is an element that stamps and binds objects from an model
type DomRepeat struct {
	golymer.Element
	Delegate string
	ItemAs   string
	Items    interface{}
}

func newDomRepeat() *DomRepeat {
	return &DomRepeat{ItemAs: "Item"}
}

//ConnectedCallback gets the template child
func (dr *DomRepeat) ConnectedCallback() {
	dr.Element.ConnectedCallback()
	dr.Call("attachShadow", map[string]interface{}{"mode": "open"})
}

//ObserverItems controls if the Items assigned are a slice type
func (dr *DomRepeat) ObserverItems(oldValue, newValue interface{}) {
	val := reflect.ValueOf(dr.Items)
	if val.Type().Kind() != reflect.Slice {
		panic("DomRepeat items can be only slice type")
	}
	if oldValue == nil && newValue != nil {
		dr.ItemsInserted(0, val.Len())
	}
}

//ItemsInserted is a function to indicate to the DomRepeat that the underlying data has changed
//new items where inserted, starting on `row` and next `count` items
func (dr *DomRepeat) ItemsInserted(row, count int) {
	if dr.Delegate == "" {
		panic("DomRepeat Delegate is not set")
	}
	list := reflect.ValueOf(dr.Items)
	for i := 0; i < count; i++ {
		item := list.Index(row + i).Interface()
		domItem := js.Global.Get("document").Call("createElement", dr.Delegate)
		domItem.Get("__internal_object__").Set(dr.ItemAs, item)
		shadowRoot := dr.Get("shadowRoot")
		if shadowRoot.Get("children").Length() == 0 {
			shadowRoot.Call("appendChild", domItem)
			continue
		}
		//https://stackoverflow.com/questions/4793604/how-to-do-insert-after-in-javascript-without-using-a-library
		referenceNode := shadowRoot.Get("children").Index(row + i - 1)
		referenceNode.Get("parentNode").Call("insertBefore", domItem, referenceNode.Get("nextSibling"))
	}
}

//ItemsRemoved is a function to indicate to the DomRepeat that the underlying data has changed
//items where removed, starting on `row` and also the next `count` items
func (dr *DomRepeat) ItemsRemoved(row, count int) {
	for i := 0; i < count; i++ {
		domItem := dr.Get("shadowRoot").Get("children").Index(row)
		dr.Get("shadowRoot").Call("removeChild", domItem)
	}
}

func init() {
	err := golymer.Define(newDomRepeat)
	if err != nil {
		panic(err)
	}
}
