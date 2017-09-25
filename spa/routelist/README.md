# routelist

Manage your single page application's routes with an list of paths.

An path eg. `/main/item/12` is represented as an linked list

```go
route := routelist.New()

//automatically parses the actual route
route.Path //equals "main"
route.Tail.Path //equals "item"
route.Tail.Tail.Path //equals "12"
```

It can be easily integrated to the golymer data bindings and the `dom-switch` element, for showing the right element just by setting the path.

```html
<dom-switch id="domSwich" val="[[Route.Path]]">
	<div id="div1" val="div1">1</div>
	<div id="div2" val="div2">2</div>
	<dom-switch id="domSwich2" val="[[Route.Tail.Path]]">
		<div id="div3" val="div3">3</div>
		<div id="div4" val="div4">4</div>
	</dom-switch>
</dom-switch>
```

eg. setting the path to `/div1` will show the `#div1` element.


