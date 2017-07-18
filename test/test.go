package main

import (
	"testing"

	"github.com/gopherjs/gopherjs/js"
	"github.com/microo8/golymer"
)

const testElemTemplate = `
<style>
	:host {
		display: block;
		box-shadow: 0px 6px 10px #000;
		height: [[height]]px;
	}

	h1 {
		font-size: 100px;
	}
</style>

<h1>
	<span id="meh" style="display: [[Display]]; background-color: [[BackgroundColor]];">[[content]]</span>
	<input id="input" type="text" value="{{Value}}">
</h1>
`

//TestElem ...
type TestElem struct {
	golymer.Element
	content         string
	height          int
	Display         string
	BackgroundColor string
	Value           string
}

//NewTestElem ...
func NewTestElem() *TestElem {
	elem := &TestElem{
		content:         "Hello world!",
		height:          100,
		Display:         "block",
		BackgroundColor: "red",
	}
	elem.Template = testElemTemplate
	return elem
}

//TestDataBindings tests data bindings on the TestElem
func TestDataBindings(t *testing.T) {
	testElem := js.Global.Get("document").Call("querySelector", "test-elem").Interface().(*TestElem)
	t.Run("BackgroundColor", func(t *testing.T) {
		testElem.BackgroundColor = "yellow"
		if testElem.Children["meh"].Get("style").Get("backgroundColor").String() != "yellow" {
			t.Error("Error: background-color not set to yellow")
		}
	})
	t.Run("content", func(t *testing.T) {
		testElem.content = "Hi!"
		if testElem.Children["meh"].Get("innerHTML").String() != "Hi!" {
			t.Error("Error: innerHTML of span is not set")
		}
	})
	t.Run("height", func(t *testing.T) {
		testElem.height = 500
		if testElem.Get("clientHeight").Int() != 500 {
			t.Errorf("Error: height of :host is not set to 500 (%d)", testElem.Get("clientHeight").Int())
		}
	})
	t.Run("input value", func(t *testing.T) {
		testElem.Children["input"].Set("value", "test")
		if testElem.Value != "test" {
			t.Errorf("input value is not test")
		}
	})
}

func test() {
	//flag.Set("test.v", "true")
	testing.Main(func(pat, str string) (bool, error) { return true, nil },
		[]testing.InternalTest{{
			Name: "TestDataBindings",
			F:    TestDataBindings,
		}},
		[]testing.InternalBenchmark{},
		[]testing.InternalExample{},
	)
}

func main() {
	err := golymer.Define(NewTestElem)
	if err != nil {
		panic(err)
	}
	js.Global.Set("test", test)
}
