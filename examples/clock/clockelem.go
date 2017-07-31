package main

import (
	"context"
	"time"

	"github.com/microo8/golymer"
)

//FancyClock custom element that shows the current time
type FancyClock struct {
	golymer.Element
	time   string
	Format string
	ctx    context.Context
	cancel context.CancelFunc
}

//ConnectedCallback when the element is connected to the DOM, ticking may begin!
func (ce *FancyClock) ConnectedCallback() {
	ce.Element.ConnectedCallback() //must call this first
	//starts the ticking by spinning up a goroutine
	go func() {
		for {
			select {
			case <-ce.ctx.Done():
				//stops the thicking goroutine
				return
			case <-time.Tick(time.Second):
				//updates current time with the format
				ce.time = time.Now().Format(ce.Format)
			}
		}
	}()
}

//DisconnectedCallback when the element is removed from the DOM
//it stops the ticking by sending done to the context
func (ce *FancyClock) DisconnectedCallback() {
	ce.cancel()
}

//NewClockElem creates new clock-elem element
func NewClockElem() *FancyClock {
	ce := &FancyClock{Format: time.UnixDate}
	ce.ctx, ce.cancel = context.WithCancel(context.Background())
	ce.Template = `
	<style>
		:host {
			display: inline;
		    box-shadow: 0 0.018em 0.05em 0;
			font-size: 7rem;
		}
	</style>
	[[time]]`
	return ce
}

func main() {
	//define the new fancy-clock elem
	err := golymer.Define(NewClockElem)
	if err != nil {
		panic(err)
	}
}
