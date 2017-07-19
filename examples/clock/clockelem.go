package main

import (
	"time"

	"github.com/microo8/golymer"
)

//ClockElem custom element that shows the current time
type ClockElem struct {
	golymer.Element
	time   string
	Format string
}

//UpdateTime updates current time with the format
func (ce *ClockElem) UpdateTime() {
	ce.time = time.Now().Format(ce.Format)
}

//start starts the ticking
func (ce *ClockElem) start() {
	go func() {
		for range time.Tick(time.Second) {
			ce.UpdateTime()
		}
	}()
}

//NewClockElem creates new clock-elem element
func NewClockElem() *ClockElem {
	elem := new(ClockElem)
	elem.Format = time.UnixDate
	elem.Template = `
	<style>
		:host {
			display: inline;
		}
	</style>
	<p>[[time]]</p>
	`
	return elem
}

func main() {
	err := golymer.Define(NewClockElem)
	if err != nil {
		panic(err)
	}
}
