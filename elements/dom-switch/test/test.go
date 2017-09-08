package main

import (
	"testing"

	"github.com/gopherjs/gopherjs/js"
	"github.com/microo8/golymer"
	_ "github.com/microo8/golymer/elements/dom-switch"
)

var testTemplate = golymer.NewTemplate(`
<dom-switch val="[[page]]">
	<div id="div1" val="div1">1</div>
	<div id="div2" val="div2">2</div>
	<div id="div3" val="div3">3</div>
</dom-switch>
`)

//TestDomSwitch ...
type TestDomSwitch struct {
	golymer.Element
	page string
}

func newTestDomSwitch() *TestDomSwitch {
	te := new(TestDomSwitch)
	te.page = "div1"
	te.SetTemplate(testTemplate)
	return te
}

//TestDomSwitchElement ...
func TestDomSwitchElement(t *testing.T) {
	testDomSwitch := js.Global.Get("document").Call("querySelector", "test-dom-switch").Interface().(*TestDomSwitch)

	t.Run("check init page", func(t *testing.T) {
		if testDomSwitch.Children["div1"].Get("style").Get("display").String() != "block" {
			t.Errorf("div1 display not set to block")
		}
		if testDomSwitch.Children["div2"].Get("style").Get("display").String() != "none" {
			t.Errorf("div2 display not set to none")
		}
		if testDomSwitch.Children["div3"].Get("style").Get("display").String() != "none" {
			t.Errorf("div3 display not set to none")
		}
	})

	t.Run("check div2 page", func(t *testing.T) {
		testDomSwitch.page = "div2"
		if testDomSwitch.Children["div1"].Get("style").Get("display").String() != "none" {
			t.Errorf("div1 display not set to none")
		}
		if testDomSwitch.Children["div2"].Get("style").Get("display").String() != "block" {
			t.Errorf("div2 display not set to block")
		}
		if testDomSwitch.Children["div3"].Get("style").Get("display").String() != "none" {
			t.Errorf("div3 display not set to none")
		}
	})

	t.Run("check div3 page", func(t *testing.T) {
		testDomSwitch.page = "div3"
		if testDomSwitch.Children["div1"].Get("style").Get("display").String() != "none" {
			t.Errorf("div1 display not set to none")
		}
		if testDomSwitch.Children["div2"].Get("style").Get("display").String() != "none" {
			t.Errorf("div2 display not set to none")
		}
		if testDomSwitch.Children["div3"].Get("style").Get("display").String() != "block" {
			t.Errorf("div3 display not set to block")
		}
	})

	t.Run("check wrong input page", func(t *testing.T) {
		testDomSwitch.page = "wrong"
		if testDomSwitch.Children["div1"].Get("style").Get("display").String() != "none" {
			t.Errorf("div1 display not set to none")
		}
		if testDomSwitch.Children["div2"].Get("style").Get("display").String() != "none" {
			t.Errorf("div2 display not set to none")
		}
		if testDomSwitch.Children["div3"].Get("style").Get("display").String() != "none" {
			t.Errorf("div3 display not set to none")
		}
	})
}

var testBoolTemplate = golymer.NewTemplate(`
<dom-switch val="[[active]]">
	<div id="div1" val="false">1</div>
	<div id="div2" val="true">2</div>
</dom-switch>
`)

//TestDomSwitchBool ...
type TestDomSwitchBool struct {
	golymer.Element
	active bool
}

func newTestDomSwitchBool() *TestDomSwitchBool {
	te := new(TestDomSwitchBool)
	te.SetTemplate(testBoolTemplate)
	return te
}

//TestDomSwitchElementBool ...
func TestDomSwitchElementBool(t *testing.T) {
	testDomSwitchBool := js.Global.Get("document").Call("querySelector", "test-dom-switch-bool").Interface().(*TestDomSwitchBool)

	t.Run("check init page", func(t *testing.T) {
		if testDomSwitchBool.Children["div1"].Get("style").Get("display").String() != "block" {
			t.Errorf("div1 display not set to block")
		}
		if testDomSwitchBool.Children["div2"].Get("style").Get("display").String() != "none" {
			t.Errorf("div2 display not set to none")
		}
	})

	t.Run("check true page", func(t *testing.T) {
		testDomSwitchBool.active = true
		if testDomSwitchBool.Children["div1"].Get("style").Get("display").String() != "none" {
			t.Errorf("div1 display not set to none")
		}
		if testDomSwitchBool.Children["div2"].Get("style").Get("display").String() != "block" {
			t.Errorf("div2 display not set to block")
		}
	})
}

func test() {
	//flag.Set("test.v", "true")
	go testing.Main(func(pat, str string) (bool, error) { return true, nil },
		[]testing.InternalTest{
			{
				Name: "TestDomSwitchElement",
				F:    TestDomSwitchElement,
			},
			{
				Name: "TestDomSwitchElementBool",
				F:    TestDomSwitchElementBool,
			},
		},
		[]testing.InternalBenchmark{},
		[]testing.InternalExample{},
	)
}

func init() {
	err := golymer.Define(newTestDomSwitch)
	if err != nil {
		panic(err)
	}
	err = golymer.Define(newTestDomSwitchBool)
	if err != nil {
		panic(err)
	}
	js.Global.Set("test", test)
}

func main() {}
