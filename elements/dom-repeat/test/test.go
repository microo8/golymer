package main

import (
	"testing"

	"github.com/gopherjs/gopherjs/js"
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

//TestDomRepeatElement ...
func TestDomRepeatElement(t *testing.T) {
	testDomRepeat := js.Global.Get("document").Call("querySelector", "test-dom-repeat").Interface().(*TestDomRepeat)

	t.Run("Init two items", func(t *testing.T) {
		children := testDomRepeat.repeat.Get("shadowRoot").Get("children")
		if children.Length() != 2 {
			t.Fatalf("domRepeat didn't stampt two elems")
		}
		item1, ok := children.Index(0).Interface().(*TestItem)
		if !ok {
			t.Errorf("cannot type assert test-item")
		}
		if item1.Get("shadowRoot").Get("children").Index(0).Get("innerHTML").String() != "1" {
			t.Errorf("div1 doesn't have acurate innerHTML")
		}
		if item1.Get("shadowRoot").Get("children").Index(1).Get("innerHTML").String() != "2" {
			t.Errorf("div2 doesn't have acurate innerHTML")
		}
		item2, ok := children.Index(1).Interface().(*TestItem)
		if !ok {
			t.Errorf("cannot type assert test-item")
		}
		if item2.Get("shadowRoot").Get("children").Index(0).Get("innerHTML").String() != "2" {
			t.Errorf("div1 doesn't have acurate innerHTML")
		}
		if item2.Get("shadowRoot").Get("children").Index(1).Get("innerHTML").String() != "3" {
			t.Errorf("div2 doesn't have acurate innerHTML")
		}
	})

	t.Run("Add items", func(t *testing.T) {
		testDomRepeat.Data = append(testDomRepeat.Data, &item{100, 200}, &item{300, 400})
		testDomRepeat.repeat.ItemsInserted(2, 2)
		children := testDomRepeat.repeat.Get("shadowRoot").Get("children")
		if children.Length() != 4 {
			t.Fatalf("domRepeat didn't add new children")
		}

		item1, ok := children.Index(0).Interface().(*TestItem)
		if !ok {
			t.Errorf("cannot type assert test-item")
		}
		if item1.Get("shadowRoot").Get("children").Index(0).Get("innerHTML").String() != "1" {
			t.Errorf("div1 doesn't have acurate innerHTML")
		}
		if item1.Get("shadowRoot").Get("children").Index(1).Get("innerHTML").String() != "2" {
			t.Errorf("div2 doesn't have acurate innerHTML")
		}
		item2, ok := children.Index(1).Interface().(*TestItem)
		if !ok {
			t.Errorf("cannot type assert test-item")
		}
		if item2.Get("shadowRoot").Get("children").Index(0).Get("innerHTML").String() != "2" {
			t.Errorf("div1 doesn't have acurate innerHTML")
		}
		if item2.Get("shadowRoot").Get("children").Index(1).Get("innerHTML").String() != "3" {
			t.Errorf("div2 doesn't have acurate innerHTML")
		}

		item3, ok := children.Index(2).Interface().(*TestItem)
		if !ok {
			t.Errorf("cannot type assert test-item")
		}
		if item3.Get("shadowRoot").Get("children").Index(0).Get("innerHTML").String() != "100" {
			t.Errorf("div1 doesn't have acurate innerHTML")
		}
		if item3.Get("shadowRoot").Get("children").Index(1).Get("innerHTML").String() != "200" {
			t.Errorf("div2 doesn't have acurate innerHTML")
		}
		item4, ok := children.Index(3).Interface().(*TestItem)
		if !ok {
			t.Errorf("cannot type assert test-item")
		}
		if item4.Get("shadowRoot").Get("children").Index(0).Get("innerHTML").String() != "300" {
			t.Errorf("div1 doesn't have acurate innerHTML")
		}
		if item4.Get("shadowRoot").Get("children").Index(1).Get("innerHTML").String() != "400" {
			t.Errorf("div2 doesn't have acurate innerHTML")
		}
	})

	t.Run("remove items", func(t *testing.T) {
		testDomRepeat.Data = testDomRepeat.Data[2:]
		testDomRepeat.repeat.ItemsRemoved(0, 2)

		children := testDomRepeat.repeat.Get("shadowRoot").Get("children")
		if children.Length() != 2 {
			t.Fatalf("domRepeat didn't remove new children")
		}

		item3, ok := children.Index(0).Interface().(*TestItem)
		if !ok {
			t.Errorf("cannot type assert test-item")
		}
		if item3.Get("shadowRoot").Get("children").Index(0).Get("innerHTML").String() != "100" {
			t.Errorf("div1 doesn't have acurate innerHTML")
		}
		if item3.Get("shadowRoot").Get("children").Index(1).Get("innerHTML").String() != "200" {
			t.Errorf("div2 doesn't have acurate innerHTML")
		}
		item4, ok := children.Index(1).Interface().(*TestItem)
		if !ok {
			t.Errorf("cannot type assert test-item")
		}
		if item4.Get("shadowRoot").Get("children").Index(0).Get("innerHTML").String() != "300" {
			t.Errorf("div1 doesn't have acurate innerHTML")
		}
		if item4.Get("shadowRoot").Get("children").Index(1).Get("innerHTML").String() != "400" {
			t.Errorf("div2 doesn't have acurate innerHTML")
		}
	})
}

func test() {
	//flag.Set("test.v", "true")
	go testing.Main(func(pat, str string) (bool, error) { return true, nil },
		[]testing.InternalTest{
			{
				Name: "TestDomRepeatElement",
				F:    TestDomRepeatElement,
			},
		},
		[]testing.InternalBenchmark{},
		[]testing.InternalExample{},
	)
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
	js.Global.Set("test", test)
}

func main() {}
