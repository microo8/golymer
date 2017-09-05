# dom-repeat element

Stamps out the delegate element from an slice.

## usage

If you want to repeat elements from an slice of objects.

```go
//UserItem is the object that will be passed to the delegate element
type UserItem struct {
	UserName  string	
	AvatarURL string
}

//UserDelegate is an element that will be stamped out by the dom-repeat
type UserDelegate struct {
	golymer.Element
	Item *UserItem //the data that will be passed to the Delegate
}

...

var myTemplate = golymer.NewTemplate(`
<dom-repeat id="repeat" delegate="user-delegate" items="{{UserItems}}"></dom-repeat>
`)

type MyElem struct {
	golymer.Element
	UserItems []*UserItem
	repeat    *domrepeat.DomRepeat
}
```

To add new `UserItem`s, just append to the slice `myElem.UserItems = append(myElem.UserItems, newUserItem, anotherUserItem)`, and then you must signalize to the `dom-repeat` element that something has changed, with the `ItemsInterted` method.

```go
myElem.repeat.ItemsInterted(len(myElem.UserItems)-2, 2) //the last two rows were inserted
```

The same with removing items: `myElem.UserItems = myElem.UserItems[3:]`

```go
myElem.repeat.ItemsRemoved(0, 3) //the first three items where removed
```


Material Design buttons repeat example:

```go
	rb.Buttons = []*button{
		&button{"click1", "red"},
		&button{"click2", "blue"},
		&button{"click3", "green"},
		&button{"click4", "yellow"},
	}
```


![repeat-buttons](https://raw.githubusercontent.com/microo8/golymer/master/elements/dom-repeat/example/screen.png)
