package domswitch

import "github.com/microo8/golymer"

//DomSwitch shows one of its children if it's Val attribute is equal to childs val attribute
type DomSwitch struct {
	golymer.Element
	Val   string
	ValAs string
}

func newDomSwitch() *DomSwitch {
	ds := new(DomSwitch)
	ds.ValAs = "val"
	return ds
}

//ObserverVal shows child by val attribute value
func (ds *DomSwitch) ObserverVal(oldValue, newValue string) {
	for i := 0; i < ds.Get("children").Length(); i++ {
		child := ds.Get("children").Index(i)
		attributeValue := child.Call("getAttribute", ds.ValAs).String()
		if attributeValue == "null" || attributeValue != newValue {
			child.Get("style").Set("display", "none")
			continue
		}
		child.Get("style").Set("display", "block")
	}
}

func init() {
	err := golymer.Define(newDomSwitch)
	if err != nil {
		panic(err)
	}
}
