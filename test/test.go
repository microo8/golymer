package main

import (
	"strconv"
	"testing"
	"time"

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

<h1 id="heading" height="{{Value}}" int="{{intValue2}}">
	<span id="meh" style="background-color: [[BackgroundColor]];">[[content]]</span>
</h1>
<test-elem-two id="two" display="[[Display]]" counter="{{intValue}}"></test-elem-two>

<form>
	<h2 id="formHeading">[[dataObject.Heading]]</h2>
	<input id="inputAge" type="number" value="{{dataObject.Age}}">
	<input id="inputName" type="text" value="{{dataObject.Name}}">
	<input id="inputDate" type="date" value="{{dataObject.Date}}">
	<input id="inputActive" type="checkbox" checked="{{dataObject.Active}}">
</form>
`

//TestElem ...
type TestElem struct {
	golymer.Element
	content         string
	height          int
	Display         string
	BackgroundColor string
	Value           string
	intValue        int
	intValue2       int
	dataObject      *TestDataObject
}

//NewTestElem ...
func NewTestElem() *TestElem {
	elem := &TestElem{
		content:         "Hello world!",
		height:          100,
		Display:         "block",
		BackgroundColor: "red",
		dataObject: &TestDataObject{
			Age:    28,
			Name:   "John",
			Date:   time.Now(),
			Active: true,
		},
	}
	elem.Template = testElemTemplate
	return elem
}

//TestDataObject ...
type TestDataObject struct {
	Heading string
	Age     int
	Name    string
	Date    time.Time
	Active  bool
}

//TestElemTwo ...
type TestElemTwo struct {
	golymer.Element
	Display string
	Value   string
	Counter int
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

const mutationWait = 50

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
		values := []string{"test", "100", ""}
		for _, value := range values {
			testElem.Children["heading"].Call("setAttribute", "height", value)
			if testElem.Children["heading"].Call("getAttribute", "height").Interface() != value {
				t.Errorf(
					"testElemTwo has not changed value attribute to %v (%T) value is: %v (%T)",
					value,
					value,
					testElem.Children["heading"].Call("getAttribute", "height").Interface(),
					testElem.Children["heading"].Call("getAttribute", "height").Interface(),
				)
			}
			time.Sleep(time.Millisecond * mutationWait)
			if testElem.Value != value {
				t.Errorf(
					"two way databinding error: elem two value set but test-elem.Value is not %v (%T), value is: %v (%T)",
					value,
					value,
					testElem.Value,
					testElem.Value,
				)
			}
		}
	})

	t.Run("two way int value to another custom element", func(t *testing.T) {
		values := []int{123, -1233, 0, 12321312}
		for _, value := range values {
			testElemTwo.Counter = value
			time.Sleep(time.Millisecond * mutationWait)
			if testElem.intValue != value {
				t.Errorf("two way databinding value error: want %v(%T) got %v(%T)", value, value, testElem.intValue, testElem.intValue)
			}
		}
	})

	t.Run("two way int value to html element attribute", func(t *testing.T) {
		values := []int{123, -1233, 0, 12321312}
		for _, value := range values {
			testElem.Children["heading"].Call("setAttribute", "int", value)
			time.Sleep(time.Millisecond * mutationWait)
			if testElem.intValue2 != value {
				t.Errorf("two way databinding value error: want %v(%T) got %v(%T)", value, value, testElem.intValue, testElem.intValue)
			}
		}
	})

	t.Run("twoWayDataBinding other direction", func(t *testing.T) {
		values := []int{123, -1233, 0, 12321312}
		for _, value := range values {
			testElem.intValue = value
			if testElemTwo.Counter != value {
				t.Errorf("twoWayDataBinding error doesn't set value the other direction: want %v(%T) got %v(%T)",
					value, value,
					testElemTwo.Counter, testElemTwo.Counter)
			}
		}
	})

	t.Run("twoWayDataBinding other direction in html element", func(t *testing.T) {
		values := []int{123, -1233, 0, 12321312}
		for _, value := range values {
			testElem.intValue2 = value
			if testElem.Children["heading"].Call("getAttribute", "int").String() != strconv.Itoa(value) {
				t.Errorf(
					"twoWayDataBinding error doesn't set value the other direction: want %v got %v",
					strconv.Itoa(value),
					testElem.Children["heading"].Call("getAttribute", "int").String(),
				)
			}
		}
	})

	t.Run("subproperty oneWayDataBinding", func(t *testing.T) {
		testElem.dataObject.Heading = "form"
		if testElem.Children["formHeading"].Get("innerHTML").String() != "form" {
			t.Errorf("setting subproperty dataObject.Heading didn't set the oneWayDataBinding")
		}
	})

	t.Run("subproperty twoWayDataBinding", func(t *testing.T) {
		testElem.dataObject.Age = 30
		if testElem.Children["inputAge"].Get("value").Int() != 30 {
			t.Errorf("setting dataObject.Age to 30 doesn't set the input value. got %v(%T)",
				testElem.Children["inputAge"].Get("value").Interface(),
				testElem.Children["inputAge"].Get("value").Interface(),
			)
		}
		testElem.dataObject.Name = "George"
		if testElem.Children["inputAge"].Get("value").String() != "George" {
			t.Errorf("setting dataObject.Name to George doesn't set the input value. got %v(%T)",
				testElem.Children["inputName"].Get("value").Interface(),
				testElem.Children["inputName"].Get("value").Interface(),
			)
		}
		testElem.dataObject.Active = false
		if testElem.Children["inputActive"].Get("checked").Bool() != false {
			t.Errorf("setting dataObject.Active to false doesn't set the input value. got %v(%T)",
				testElem.Children["inputActive"].Get("value").Interface(),
				testElem.Children["inputActive"].Get("value").Interface(),
			)
		}
		testElem.dataObject.Date = time.Date(2000, 1, 1, 1, 0, 0, 0, time.UTC)
		if testElem.Children["inputDate"].Get("value").String() != testElem.dataObject.Date.Format("2001-05-01") {
			t.Errorf("setting date didn't set the inputDate.value, got %v(%T)",
				testElem.Children["inputDate"].Get("value").Interface(),
				testElem.Children["inputDate"].Get("value").Interface(),
			)
		}
	})
}

func test() {
	//flag.Set("test.v", "true")
	go testing.Main(func(pat, str string) (bool, error) { return true, nil },
		[]testing.InternalTest{
			{
				Name: "TestConstructorFunction",
				F:    TestConstructorFunction,
			},
			{
				Name: "TestTypeAssertion",
				F:    TestTypeAssertion,
			},
			{
				Name: "TestDataBindings",
				F:    TestDataBindings,
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
