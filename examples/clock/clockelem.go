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

//updateTime updates current time with the format
func (ce *FancyClock) updateTime() {
	ce.time = time.Now().Format(ce.Format)
}

//start starts the ticking by spinning up a goroutine
func (ce *FancyClock) start() {
	go func() {
		for {
			select {
			case <-ce.ctx.Done():
				return
			case <-time.Tick(time.Second):
				ce.updateTime()
			}
		}
	}()
}

//ConnectedCallback when the element is connected, ticking may begin!
func (ce *FancyClock) ConnectedCallback() {
	ce.Element.ConnectedCallback() //must call this first
	ce.start()
}

//DisconnectedCallback stops the ticking by sending done to the context
func (ce *FancyClock) DisconnectedCallback() {
	ce.cancel()
}

//NewClockElem creates new clock-elem element
func NewClockElem() *FancyClock {
	ce := new(FancyClock)
	ce.ctx, ce.cancel = context.WithCancel(context.Background())
	ce.Format = time.UnixDate
	ce.Template = `
	<style>
		:host {
			display: inline;
		    box-shadow: 0 0.018em 0.05em 0;
			font-size: 7rem;
		}
	</style>
	[[time]]
	`
	return ce
}

func main() {
	err := golymer.Define(NewClockElem)
	if err != nil {
		panic(err)
	}
}
