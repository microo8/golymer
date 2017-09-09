package routelist

import (
	"strings"

	"github.com/gopherjs/gopherjs/js"
)

//RouteList represents the document.location.pathname parsed to an List-like object
type RouteList struct {
	Path   string
	Tail   *RouteList
	parent *RouteList
}

//Set sets the current RouteList's path location; for Tail routes it sets just the subpath
func (r *RouteList) Set(path string) {
	if path[0] == '/' {
		panic("RouteList Set error: cannot set absolute path")
	}
	if r.parent != nil {
		r.parent.Set(r.parent.Path + "/" + path)
		return
	}
	newLocation := "/" + path
	js.Global.Get("history").Call("pushState", nil, nil, newLocation)
	r.refresh()
}

func (r *RouteList) String() string {
	if r == nil {
		return ""
	}
	return r.Path + "/" + r.Tail.String()
}

func (r *RouteList) refresh() {
	pathname := js.Global.Get("document").Get("location").Get("pathname").String()
	newRoute := newRouteList(pathname, nil)
	r.Path = newRoute.Path
	r.Tail = newRoute.Tail
}

//New returns new RouteList with parsed actual document.location.pathname
func New() *RouteList {
	pathname := js.Global.Get("document").Get("location").Get("pathname").String()
	r := newRouteList(pathname, nil)
	js.Global.Get("window").Call("addEventListener", "popstate", func() {
		r.refresh()
	})
	return r
}

func newRouteList(pathname string, parent *RouteList) *RouteList {
	if pathname == "" || pathname == "/" {
		return nil
	}
	if pathname[0] != '/' {
		panic("RouteList parsing error: pathname must begin with a backslash '/'")
	}
	index := strings.Index(pathname[1:], "/")
	if index == -1 {
		return &RouteList{Path: pathname[1:], parent: parent}
	}
	r := &RouteList{
		Path:   pathname[1 : index+1],
		parent: parent,
	}
	r.Tail = newRouteList(pathname[index+1:], r)
	return r
}
