package domswitch

import "github.com/microo8/golymer"

//DomSwitch shows one of its children if it's Val attribute is equal to childs val attribute
type DomSwitch struct {
	golymer.Element
	Expr   string
	CaseAs string
}

func newDomSwitch() *DomSwitch {
	ds := new(DomSwitch)
	ds.CaseAs = "case"
	return ds
}

//ObserverExpr shows child by val attribute value
func (ds *DomSwitch) ObserverExpr(oldValue, newValue string) {
	for i := 0; i < ds.Get("children").Length(); i++ {
		child := ds.Get("children").Index(i)
		attributeValue := child.Call("getAttribute", ds.CaseAs).String()
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
