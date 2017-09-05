package mdspinner

import "github.com/microo8/golymer"

var mdSpinnerTemplate = golymer.NewTemplate(`
<style>
:host {
	display: [[display]];
}

.spinner {
	display: block;
	margin-top: 2em;
	margin-right: auto;
	margin-left: auto;
	width: 4em;
	height: 4em;
    padding: 7px;
	transform: scale(.7);
}

.spinner-wrapper {
	position: relative;
	width: 4em;
	height: 4em;
	border-radius: 100%;
	left: calc(50% - 2em);
}

.spinner-wrapper::after {
	content: "";
	background: #fff;
	border-radius: 50%;
	width: 3em;
	height: 3em;
	position: absolute;
	top: 0.5em;
	left: 0.5em;
} 

.rotator {
	position: relative;
	width: 4em;
	border-radius: 4em;
	overflow: hidden;
	animation: rotate 1000ms infinite linear;
}

.rotator:before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: #3F51B5;
	border: 3px solid #fff;
	border-radius: 100%;
}

.inner-spin {
	background: #fff;
	height: 4em;
	width: 2em;
}

.inner-spin {
	animation: rotate-left 1500ms infinite cubic-bezier(0.445, 0.050, 0.550, 0.950);
	border-radius: 2em 0 0 2em;
	transform-origin: 2em 2em;
}

.inner-spin:last-child {
	animation: rotate-right 1500ms infinite cubic-bezier(0.445, 0.050, 0.550, 0.950);
	margin-top: -4em;
	border-radius: 0 2em 2em 0;
	float: right;
	transform-origin: 0 50%;
}

@keyframes rotate-left {
	60%, 75%, 100% {
    	transform: rotate(360deg);
  	}
}

@keyframes rotate {
	0% {
    	transform: rotate(0);
  	}
  	100% {
    	transform: rotate(360deg);
  	}
}

@keyframes rotate-right {
	0%, 25%, 45% {
    	transform: rotate(0);
  	}

  	100% {
    	transform: rotate(360deg);
  	}
}

</style>
<div class="spinner">
  <div class="spinner-wrapper">
    <div class="rotator">
      <div class="inner-spin"></div>
      <div class="inner-spin"></div>
    </div>
  </div>
</div>`)

//MdSpinner implements the material design spinner element
type MdSpinner struct {
	golymer.Element
	Active  bool
	display string
}

func newMdSpinner() *MdSpinner {
	mds := new(MdSpinner)
	mds.SetTemplate(mdSpinnerTemplate)
	mds.Active = true
	mds.display = "inline"
	return mds
}

//ObserverActive hides/shows the spinner accordingly to the Active field
func (mds *MdSpinner) ObserverActive(oldValue, newValue bool) {
	if newValue {
		mds.display = "inline"
		return
	}
	mds.display = "none"
}

func init() {
	err := golymer.Define(newMdSpinner)
	if err != nil {
		panic(err)
	}
}
