package golymer

import (
	"strings"

	"github.com/gopherjs/gopherjs/js"
)

type dataBindingSetter interface {
	setAttr(*js.Object)
}

type oneWaySetter struct {
	str       string
	attribute *js.Object
	paths     []string
}

func (db oneWaySetter) setAttr(obj *js.Object) {
	value := db.str
	for _, path := range db.paths {
		fieldValue := newAttrPath(path).Get(obj)
		value = strings.Replace(value, "[["+path+"]]", fieldValue.String(), -1)
	}
	if db.attribute.Get("value") != js.Undefined { //if it's an attribute
		db.attribute.Set("value", value)
		//if it is an input node, also set the property
		if db.attribute.Get("ownerElement").Get("nodeName").String() == "INPUT" {
			db.attribute.Get("ownerElement").Set(db.attribute.Get("name").String(), value)
		}
		return
	}
	db.attribute.Set("data", value) //if it's an text node
}

type twoWaySetter struct {
	path   string
	setter func(*js.Object)
}

func (db twoWaySetter) setAttr(obj *js.Object) {
	value := newAttrPath(db.path).Get(obj)
	db.setter(value)
}

type twoWayAttrSetter struct {
	attribute        *js.Object
	path             string
	mutationObserver *js.Object
}

func (db twoWayAttrSetter) setAttr(obj *js.Object) {
	value := newAttrPath(db.path).Get(obj)
	if db.attribute.Get("value").String() == value.String() {
		return
	}
	db.attribute.Set("value", value)
	//if it is an input node, also set the property
	if db.attribute.Get("ownerElement").Get("nodeName").String() == "INPUT" {
		db.attribute.Get("ownerElement").Set(db.attribute.Get("name").String(), value)
	}
}
