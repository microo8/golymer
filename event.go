package golymer

import (
	"time"

	"github.com/gopherjs/gopherjs/js"
)

//Event represents any event which takes place in the DOM
type Event struct {
	*js.Object
	//A Boolean indicating whether the event bubbles up through the DOM or not.
	Bubbles bool `js:"bubbles"`
	//A historical alias to Event.stopPropagation().
	//Setting its value to true before returning from an event handler prevents propagation of the event.
	CancelBubble bool `js:"cancelBubble"`
	//A Boolean indicating whether the event is cancelable.
	Cancelable bool `js:"cancelable"`
	//A Boolean value indicating whether or not the event can bubble across the boundary between the shadow DOM and the regular DOM.
	Composed bool `js:"composed"`
	//A reference to the currently registered target for the event.
	//This is the object to which the event is currently slated to be sent to;
	//it's possible this has been changed along the way through retargeting.
	CurrentTarget *js.Object `js:"currentTarget"`
	//An Array of DOM Nodes through which the event has bubbled.
	DeepPath []*js.Object `js:"deepPath"`
	//Indicates whether or not event.preventDefault() has been called on the event.
	DefaultPrevented bool `js:"defaultPrevented"`
	//Indicates which phase of the event flow is being processed.
	EventPhase int `js:"eventPhase"`
	//A reference to the target to which the event was originally dispatched.
	Target *js.Object `js:"target"`
	//The time at which the event was created, in milliseconds.
	//By specification, this value is time since epoch, but in reality browsers' definitions vary;
	//in addition, work is underway to change this to be a DOMHighResTimeStamp instead.
	TimeStamp time.Time `js:"timeStamp"`
	//The name of the event (case-insensitive).
	Type string `js:"type"`
	//Indicates whether not the event was initiated by the browser (after a user click for instance)
	//or by a script (using an event creation method, like event.initEvent)
	IsTrusted bool `js:"isTrusted"`
}

//StopPropagation prevents further propagation of the current event in the capturing and bubbling phases
func (e *Event) StopPropagation() {
	e.Call("stopPropagation")
}

//NewEvent creates new Event and sets its type name
func NewEvent(typ string) *Event {
	return &Event{
		Object: js.Global.Get("Event").New(typ),
	}
}

//CustomEvent represents events initialized by an application for any purpose.
type CustomEvent struct {
	*js.Object
	*Event
	//Any data passed when initializing the event
	Detail map[string]interface{} `js:"detail"`
}

//WithDetail sets new key-value pair to the detail data and returns the CustomEvent
//TODO maybe it has to return an new event?
func (ce *CustomEvent) WithDetail(key string, value interface{}) *CustomEvent {
	ce.Detail[key] = value
	return ce
}

//NewCustomEvent creates new CustomEvent and sets its type name
func NewCustomEvent(typ string) *CustomEvent {
	customEvent := js.Global.Get("CustomEvent").New(typ)
	return &CustomEvent{
		Object: customEvent,
		Event: &Event{
			Object: customEvent,
		},
		Detail: make(map[string]interface{}),
	}
}
