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

<h1 id="heading" height="{{Value}}">
	<span id="meh" style="background-color: [[BackgroundColor]];">[[content]]</span>
</h1>
<test-elem-two id="two" display="[[Display]]"></test-elem-two>
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

//TestElemTwo ...
type TestElemTwo struct {
	golymer.Element
	Display string
	Value   string
}

//NewTestElemTwo ...
func NewTestElemTwo() *TestElemTwo {
	elem := &TestElemTwo{
		Display: "none",
		Value:   "foobar",
	}
	elem.Template = `
	<style>
		:host {
			display: [[Display]];
			background-color: red;
			width: 10vw;
			height: 10vh;
		}
	</style>
	test-elem-two
	`
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
	testElem, ok := js.Global.Get("document").Call("querySelector", "test-elem").Interface().(*TestElem)
	if !ok {
		t.Fatalf("DOM node cannot be type-asserted to *TestElem")
	}
	two, ok := testElem.Children["two"]
	if !ok {
		t.Error("test-elem didn't collect child with id 'two'")
	}
	_, ok = two.Interface().(*TestElemTwo)
	if !ok {
		t.Fatalf("child 'tow' DOM node cannot be type-asserted to *TestElemTwo")
	}
}

//TestDataBindings tests data bindings on the TestElem
func TestDataBindings(t *testing.T) {
	testElem := js.Global.Get("document").Call("querySelector", "test-elem").Interface().(*TestElem)
	testElemTwo := testElem.Children["two"].Interface().(*TestElemTwo)

	t.Run("Non existing attribute", func(t *testing.T) {
		testElem.Call("setAttribute", "foo-attribute", "bar-value")
		if testElem.Get("__internal_object__").Get("fooAttribute").String() == "bar-value" {
			t.Error("setAttribute has set non-existing attribute on test-elem tag")
		}
	})
	t.Run("BackgroundColor", func(t *testing.T) {
		testElem.BackgroundColor = "yellow"
		if testElem.Children["meh"].Get("style").Get("backgroundColor").String() != "yellow" {
			t.Error("Error: background-color not set to yellow")
		}
		if testElem.Call("getAttribute", "background-color").String() != "yellow" {
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
	t.Run("testElem two display", func(t *testing.T) {
		testElem.Display = "flex"
		if testElemTwo.Display != "flex" {
			t.Errorf("testElemTwo has not set Display to flex")
		}
		if testElemTwo.Call("getAttribute", "display").String() != "flex" {
			t.Errorf("testElemTwo has not set tag attribute display to flex")
		}
	})
	t.Run("two way value", func(t *testing.T) {
		testElem.Children["heading"].Call("setAttribute", "height", "test")
		if testElem.Children["heading"].Call("getAttribute", "value").String() != "test" {
			t.Errorf("testElemTwo has not changed value attribute to 'test' value is: '%s'", testElemTwo.Call("getAttribute", "value").String())
		}
		if testElem.Value != "test" {
			t.Errorf("two way databinding error: elem two value set but test-elem.Value is not test")
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
	err = golymer.Define(NewTestElemTwo)
	if err != nil {
		panic(err)
	}
	js.Global.Set("test", test)
}
