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

//testing constructors

//TestA ...
type TestA struct {
	golymer.Element
}

//Testb ...
type Testb struct {
	golymer.Element
}

type testC struct{}
type testD struct {
	testC
}

func mehA() *TestA { return new(TestA) }
func mehB() *Testb { return new(Testb) }
func mehC() *testC { return new(testC) }
func mehD() *testD { return new(testD) }

//TestConstructorFunction tests if the Define function takes only valid constructors
func TestConstructorFunction(t *testing.T) {
	err := golymer.Define(mehA)
	if err != nil {
		t.Error(err)
	}
	err = golymer.Define(err)
	if err == nil {
		t.Errorf("cannot define something that isn't a function")
	}
	err = golymer.Define(mehB)
	if err == nil {
		t.Errorf("cannot define struct with camelCase name that doesn't have min two bumbs")
	}
	err = golymer.Define(mehC)
	if err == nil {
		t.Error("cannot define struct that doesn't embedd golymer.Element")
	}
	err = golymer.Define(mehD)
	if err == nil {
		t.Error("cannot define struct that doesn't embedd golymer.Element")
	}
}

//TestTypeAssertion tests if the DOM node (*js.Object) can be type-asserted to own elem type
func TestTypeAssertion(t *testing.T) {
	_, ok := js.Global.Get("document").Call("querySelector", "test-elem").Interface().(golymer.CustomElement)
	if !ok {
		t.Fatalf("DOM node cannot be type-asserted to CustomElement interface")
	}
	_, ok = js.Global.Get("document").Call("querySelector", "test-elem").Interface().(*TestElem)
	if !ok {
		t.Fatalf("DOM node cannot be type-asserted to *TestElem")
	}
}

//TestDataBindings tests data bindings on the TestElem
func TestDataBindings(t *testing.T) {
	testElem := js.Global.Get("document").Call("querySelector", "test-elem").Interface().(*TestElem)
	t.Run("BackgroundColor", func(t *testing.T) {
		testElem.BackgroundColor = "yellow"
		if testElem.Children["meh"].Get("style").Get("backgroundColor").String() != "yellow" {
			t.Error("Error: background-color not set to yellow")
		}
		if testElem.Get("background-color").String() != "yellow" {
			t.Error("Error: background-color attribute of test-elem not set to yellow (it's an exported field, it must set attributes of the tag)")
		}
		testElem.Call("setAttribute", "background-color", "green")
		if testElem.Children["meh"].Get("style").Get("backgroundColor").String() != "green" {
			t.Error("Error: setting background-color attribute of test-elem didn't set to #meh.style.background-color to green")
		}
		if testElem.BackgroundColor != "green" {
			t.Error("testElem.BackgroundColor is not set to green after setting the attribute background-color of test-elem")
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
		[]testing.InternalTest{
			{
				Name: "TestDataBindings",
				F:    TestDataBindings,
			},
			{
				Name: "TestTypeAssertion",
				F:    TestTypeAssertion,
			},
		},
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
