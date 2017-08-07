package main

import (
	"strconv"
	"testing"
	"time"

	"github.com/gopherjs/gopherjs/js"
	"github.com/microo8/golymer"
)

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
		testElem.inputObject.Heading = "form"
		if testElem.Children["formHeading"].Get("innerHTML").String() != "form" {
			t.Errorf("setting subproperty inputObject.Heading didn't set the oneWayDataBinding")
		}
	})

	t.Run("input subproperty twoWayDataBinding", func(t *testing.T) {
		testElem.inputObject.Age = 30
		if testElem.Children["inputAge"].Get("value").Int() != 30 {
			t.Errorf("setting inputObject.Age to 30 doesn't set the input value. got %v(%T)",
				testElem.Children["inputAge"].Get("value").Interface(),
				testElem.Children["inputAge"].Get("value").Interface(),
			)
		}
		testElem.inputObject.Name = "George"
		if testElem.Children["inputName"].Get("value").String() != "George" {
			t.Errorf("setting inputObject.Name to George doesn't set the input value. got %v(%T)",
				testElem.Children["inputName"].Get("value").Interface(),
				testElem.Children["inputName"].Get("value").Interface(),
			)
		}
		testElem.inputObject.Active = false
		if testElem.Children["inputActive"].Get("checked").Bool() != false {
			t.Errorf("setting inputObject.Active to false doesn't set the input value. got %v(%T)",
				testElem.Children["inputActive"].Get("checked").Interface(),
				testElem.Children["inputActive"].Get("checked").Interface(),
			)
		}
		/*
			TODO
			testElem.inputObject.Date = time.Date(2000, 1, 1, 1, 0, 0, 0, time.UTC)
			if testElem.Children["inputDate"].Get("value").String() != testElem.inputObject.Date.Format("2001-05-01") {
				t.Errorf("setting date didn't set the inputDate.value, got %v(%T)",
					testElem.Children["inputDate"].Get("value").Interface(),
					testElem.Children["inputDate"].Get("value").Interface(),
				)
			}
		*/
	})

	t.Run("div subproperty twoWayDataBinding", func(t *testing.T) {
		testElem.divObject.Age = 30
		if testElem.Children["divAge"].Call("getAttribute", "value").Int() != 30 {
			t.Errorf("setting divObject.Age to 30 doesn't set the input value. got %v(%T)",
				testElem.Children["divAge"].Call("getAttribute", "value").Interface(),
				testElem.Children["divAge"].Call("getAttribute", "value").Interface(),
			)
		}
		testElem.divObject.Name = "George"
		if testElem.Children["divName"].Call("getAttribute", "value").String() != "George" {
			t.Errorf("setting divObject.Name to George doesn't set the input value. got %v(%T)",
				testElem.Children["divName"].Call("getAttribute", "value").Interface(),
				testElem.Children["divName"].Call("getAttribute", "value").Interface(),
			)
		}
		testElem.divObject.Active = false
		if testElem.Children["divActive"].Call("getAttribute", "checked").String() != "false" {
			t.Errorf("setting divObject.Active to false doesn't set the input value. got %v(%T)",
				testElem.Children["divActive"].Call("getAttribute", "checked"),
				testElem.Children["divActive"].Call("getAttribute", "checked").Bool(),
			)
		}
		/*
			TODO
			testElem.divObject.Date = time.Date(2000, 1, 1, 1, 0, 0, 0, time.UTC)
			if testElem.Children["divDate"].Call("getAttribute", "value").String() != testElem.divObject.Date.Format("2001-05-01") {
				t.Errorf("setting div didn't set the divObject.Date.value, got %v(%T)",
					testElem.Children["divDate"].Call("getAttribute", "value").Interface(),
					testElem.Children["divDate"].Call("getAttribute", "value").Interface(),
				)
			}
		*/
	})

	t.Run("input subproperty twoWayDataBinding other way around", func(t *testing.T) {
		testElem.Children["inputAge"].Set("value", 100)
		time.Sleep(time.Millisecond * mutationWait)
		if testElem.inputObject.Age != 100 {
			t.Errorf("not set inputObject.Age to 100, got %v", testElem.inputObject.Age)
		}
		testElem.Children["inputName"].Set("value", "Michael")
		time.Sleep(time.Millisecond * mutationWait)
		if testElem.inputObject.Name != "Michael" {
			t.Errorf("inputName.value not set inputObject.Name to Michael, got %v", testElem.inputObject.Name)
		}
		testElem.Children["inputActive"].Set("checked", true)
		time.Sleep(time.Millisecond * mutationWait)
		if testElem.inputObject.Active != true {
			t.Errorf("not set inputObject.Active to true, got %v", testElem.inputObject.Active)
		}
		testTime := time.Date(2000, 1, 1, 1, 0, 0, 0, time.UTC)
		testElem.Children["inputDate"].Set("value", testTime.Format(time.UnixDate))
		time.Sleep(time.Millisecond * mutationWait)
		if testElem.inputObject.Date != testTime {
			t.Errorf("not set inputObject.Date to %v, got %v", testTime, testElem.inputObject.Date)
		}
	})

	t.Run("div subproperty twoWayDataBinding other way around", func(t *testing.T) {
		testElem.Children["divAge"].Call("setAttribute", "value", 100)
		time.Sleep(time.Millisecond * mutationWait)
		if testElem.divObject.Age != 100 {
			t.Errorf("not set divObject.Age to 100, got %v", testElem.divObject.Age)
		}
		testElem.Children["divName"].Call("setAttribute", "value", "Michael")
		time.Sleep(time.Millisecond * mutationWait)
		if testElem.divObject.Name != "Michael" {
			t.Errorf("divName.value not set divObject.Name to Michael, got %v", testElem.divObject.Name)
		}
		testElem.Children["divActive"].Call("setAttribute", "checked", true)
		time.Sleep(time.Millisecond * mutationWait)
		if testElem.divObject.Active != true {
			t.Errorf("not set divObject.Active to true, got %v", testElem.divObject.Active)
		}
		testTime := time.Date(2000, 1, 1, 1, 0, 0, 0, time.UTC)
		testElem.Children["divDate"].Call("setAttribute", "value", testTime.Format(time.UnixDate))
		time.Sleep(time.Millisecond * mutationWait)
		if testElem.divObject.Date != testTime {
			t.Errorf("not set divObject.Date to %v, got %v", testTime, testElem.divObject.Date)
		}
	})
}

//TestEvent tests event bindings
func TestEvent(t *testing.T) {
	testElem := js.Global.Get("document").Call("querySelector", "test-elem").Interface().(*TestElem)
	t.Run("click event", func(t *testing.T) {
		testElem.Children["heading"].Call("click")
		if !testElem.headingClicked {
			t.Error("heading on-click event is not binded")
		}
	})
}

//TestSlot tests id the custom elements has children added to the elem shadowDOM
func TestSlot(t *testing.T) {
	testElem := js.Global.Get("document").Call("querySelector", "test-elem").Interface().(*TestElem)
	t.Run("slotChild added", func(t *testing.T) {
		if _, ok := testElem.Children["slotChild"]; !ok {
			t.Error("slotChild not added")
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
				Name: "TestEvent",
				F:    TestEvent,
			},
			{
				Name: "TestSlot",
				F:    TestSlot,
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

func init() {
	js.Global.Set("test", test)
}
