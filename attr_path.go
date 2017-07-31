package golymer

import (
	"reflect"
	"strings"

	"github.com/gopherjs/gopherjs/js"
)

//attrPath is used as a path to subproperties of an js.Object
//eg obj.attr.subAttr
type attrPath []string

func newAttrPath(str string) attrPath {
	return strings.Split(str, ".")
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
		field, ok = field.Type.FieldByName(attr)
		if !ok {
			return field, false
		}
	}
	return field, true
}

//GetFieldValue gets reflect.StructField in a path from reflect.Type
func (ap attrPath) GetFieldValue(objType reflect.Value) reflect.Value {
	field := objType
	for _, attr := range ap {
		field = field.FieldByName(attr)
		if field.Kind() == reflect.Ptr {
			field = field.Elem()
		}
	}
	return field
}

//String returns an string representation of the path
func (ap attrPath) String() string {
	return strings.Join(ap, ".")
}
