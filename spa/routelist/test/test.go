package main

import (
	"errors"
	"testing"
	"time"

	"github.com/gopherjs/gopherjs/js"
	"github.com/microo8/golymer"
	domswitch "github.com/microo8/golymer/elements/dom-switch"
	"github.com/microo8/golymer/spa/routelist"
)

var tests = []struct {
	url   string
	route []string
}{
	{"/foo", []string{"foo"}},
	{"/foo/bar", []string{"foo", "bar"}},
	{"/foo/bar/xoo", []string{"foo", "bar", "xoo"}},
	{"/foo/bar/xoo/meh/", []string{"foo", "bar", "xoo", "meh"}},
	{"/foo?q=\"query\"", []string{"foo"}},
}

//TestRouteList ...
func TestRouteList(t *testing.T) {
	history := js.Global.Get("history")
	t.Run("parse location tests", func(t *testing.T) {
		for _, test := range tests {
			history.Call("pushState", nil, nil, test.url)
			route := routelist.New()
			for _, path := range test.route {
				if route.Path != path {
					t.Fatalf("the route doesn't equal to %s, got: %s", path, route.Path)
				}
				route = route.Tail
			}
			if route != nil {
				t.Errorf("run trough all route paths and the route object isn't nil")
			}
		}
	})

	t.Run("set location", func(t *testing.T) {
		history.Call("pushState", nil, nil, "/foo/bar/xoo")
		route := routelist.New()

		route.Tail.Tail.Set("meh")
		pathname := js.Global.Get("document").Get("location").Get("pathname").String()
		if pathname != "/foo/bar/meh" {
			t.Fatalf("Set didn't set the location right, expected /foo/bar/meh, got: %s", pathname)
		}

		route.Tail.Set("meh")
		pathname = js.Global.Get("document").Get("location").Get("pathname").String()
		if pathname != "/foo/meh" {
			t.Fatalf("Set didn't set the location right, expected /foo/meh, got: %s", pathname)
		}

		route.Set("meh")
		pathname = js.Global.Get("document").Get("location").Get("pathname").String()
		if pathname != "/meh" {
			t.Fatalf("Set didn't set the location right, expected /meh, got: %s", pathname)
		}

		route.Set("1/2/3")
		pathname = js.Global.Get("document").Get("location").Get("pathname").String()
		if pathname != "/1/2/3" {
			t.Fatalf("Set didn't set the location right, expected /1/2/3, got: %s", pathname)
		}

		route.Tail.Set("100/200")
		pathname = js.Global.Get("document").Get("location").Get("pathname").String()
		if pathname != "/1/100/200" {
			t.Fatalf("Set didn't set the location right, expected /1/100/200, got: %s", pathname)
		}
	})

	t.Run("back/forward", func(t *testing.T) {
		history.Call("pushState", nil, nil, "/foo/bar/xoo")
		history.Call("pushState", nil, nil, "/1/2/3")
		history.Call("pushState", nil, nil, "/10/20/30")

		mainRoute := routelist.New()
		if err := testRoute(mainRoute, []string{"10", "20", "30"}); err != nil {
			t.Fatalf("route not set to /10/20/30")
		}
		history.Call("back")
		time.Sleep(time.Millisecond * 200)
		if err := testRoute(mainRoute, []string{"1", "2", "3"}); err != nil {
			t.Fatalf("route not set to /1/2/3")
		}
		history.Call("back")
		time.Sleep(time.Millisecond * 200)
		if err := testRoute(mainRoute, []string{"foo", "bar", "xoo"}); err != nil {
			t.Fatalf("route not set to /foo/bar/xoo")
		}
		history.Call("forward")
		time.Sleep(time.Millisecond * 200)
		if err := testRoute(mainRoute, []string{"1", "2", "3"}); err != nil {
			t.Fatalf("route not set to /1/2/3")
		}
		history.Call("forward")
		time.Sleep(time.Millisecond * 200)
		if err := testRoute(mainRoute, []string{"10", "20", "30"}); err != nil {
			t.Fatalf("route not set to /10/20/30")
		}
	})
}

func testRoute(r *routelist.RouteList, paths []string) error {
	for _, path := range paths {
		if r.Path != path {
			return errors.New("the route doesn't equal to " + path + " got: " + r.Path)
		}
		r = r.Tail
	}
	if r != nil {
		return errors.New("run trough all route paths and the route object isn't nil")
	}
	return nil
}

var testRoutelistTemplate = golymer.NewTemplate(`
<dom-switch id="domSwich" val="[[Route.Path]]">
	<div id="div1" val="div1">1</div>
	<div id="div2" val="div2">2</div>
	<dom-switch id="domSwich2" val="[[Route.Tail.Path]]">
		<div id="div3" val="div3">3</div>
		<div id="div4" val="div4">4</div>
	</dom-switch>
</dom-switch>
`)

//TestRoutelist element to test routelist with dom-switch
type TestRoutelist struct {
	golymer.Element
	Route     *routelist.RouteList
	domSwich  *domswitch.DomSwitch
	domSwich2 *domswitch.DomSwitch
}

func newTestRoutelist() *TestRoutelist {
	tr := &TestRoutelist{
		Route: routelist.New(),
	}
	tr.SetTemplate(testRoutelistTemplate)
	return tr
}

//TestRouteListSwitch ...
func TestRouteListSwitch(t *testing.T) {
	elem := js.Global.Get("document").Call("querySelector", "test-routelist").Interface().(*TestRoutelist)
	elem.Route.Set("div1")
	if elem.Children["div1"].Get("style").Get("display").String() != "block" {
		t.Errorf("div1 not visible")
	}
	if elem.Children["div2"].Get("style").Get("display").String() != "none" {
		t.Errorf("div2 is visible")
	}
}

func test() {
	//flag.Set("test.v", "true")
	go testing.Main(func(pat, str string) (bool, error) { return true, nil },
		[]testing.InternalTest{
			{
				Name: "TestRouteList",
				F:    TestRouteList,
			},
			{
				Name: "TestRouteListSwitch",
				F:    TestRouteListSwitch,
			},
		},
		[]testing.InternalBenchmark{},
		[]testing.InternalExample{},
	)
}

func init() {
	err := golymer.Define(newTestRoutelist)
	if err != nil {
		panic(err)
	}
	js.Global.Set("test", test)
}

func main() {}
