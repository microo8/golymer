# md-button element

Implementation of the [material design button](https://material.io/guidelines/components/buttons.html)

## usage

The material design button has the following properties:

- `Raised    bool` 
- `Disabled  bool`
- `Hidden    bool`
- `Elevation int`

## example

```go
import (
	"github.com/microo8/golymer"
	_ "github.com/microo8/golymer/elements/md-button"
)

var template := golymer.NewTemplate(`
<style>
	--primary-color: #3F51B5;
</style>

<md-button elevation="2">click me!</md-button>
`)
```

![md-button]()
