package golymer

import (
	"reflect"

	"github.com/gopherjs/gopherjs/js"
)

//attrPath is used as a path to subproperties of an js.Object
//eg obj.attr.subAttr
type attrPath []string

func newAttrPath(str string) (path attrPath) {
	return split(str)
}

//Get returns the js.Object in the attrPath
func (ap attrPath) Get(obj *js.Object) *js.Object {
	result := obj
	for _, attrName := range ap {
		val := result.Get(attrName)
		if val == js.Undefined {
			val = result.Get("$val").Get(attrName)
			if val == js.Undefined {
				return js.Undefined
			}
		}
		result = val
	}
	return result
}

//Set sets the new value to the object attrPath
//eg. obj.attr.subAttr = value
func (ap attrPath) Set(obj *js.Object, value interface{}) {
	attr := obj
	for _, attrName := range ap[:len(ap)-1] {
		attr = attr.Get(attrName)
	}
	attr.Set(ap[len(ap)-1], value)
}

//GetField gets reflect.StructField in a path from reflect.Type
func (ap attrPath) GetField(objType reflect.Type) (reflect.StructField, bool) {
	field, ok := objType.FieldByName(ap[0])
	if !ok {
		return field, false
	}
	for _, attr := range ap[1:] {
		if field.Type.Kind() == reflect.Ptr {
			field, ok = field.Type.Elem().FieldByName(attr)
		} else {
			field, ok = field.Type.FieldByName(attr)
		}
		if !ok {
			return field, false
		}
	}
	return field, true
}

//String returns an string representation of the path
func (ap attrPath) String() string {
	return js.InternalObject(ap).Get("$array").Call("join", ".").String()
}

//StartsWith return true if the path starts with another path
func (ap attrPath) StartsWith(p attrPath) bool {
	if len(p) > len(ap) {
		return false
	}
	for i := range p {
		if ap[i] != p[i] {
			return false
		}
	}
	return true
}
