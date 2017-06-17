---
layout: docs
menu: docs
title: Composite Mark
permalink: /docs/compositemark.html
---

Composite marks are "macros" for more complex layered graphics with multiple primitive marks. Currently, we include only one composite mark type: `box-plot`

| Property      | Type          | Description    |
| :------------ |:-------------:| :------------- |
| `mark`      | String        | The CompositeMark type. Supported composite marks include: "box-plot". |

## Box Plot

`box-plot` composite mark represents a [box plot](https://en.wikipedia.org/wiki/Box_plot). The middle tick in the box represents the median. The lower and upper part of the box represents quartile 1 and 3 respectively. The point the lower and upper whiskers extend to depends on the type of `box-plot` specified. To learn more, see the Boxplot Types section.

`box-plot` supports the following [encoding channels](encoding.html#channels): `size`, `color`, `opacity`.

**Note**: `aggregate` of the continuous field is implicitly `box-plot`.

### 1D Boxplots

You can create horizontal 1D boxplots by encoding a continuous field on the y axis.

<div class="vl-example" data-name="box_plot_minmax_1D_vertical_short"></div>

You can also create horizontal 1D boxplot by encoding a continuous field on the x axis.

<div class="vl-example" data-name="box_plot_minmax_1D_horizontal_short"></div>

Encoding a discrete field on the x axis for horizontal boxplots and y axis for vertical boxplots does not make sense and therefore will not work.

### 2D Boxplots

You can create vertical and horizontal 2D boxplots. The orientation is determined by the continuous axis.

If the continuous field is on the x axis then the boxplot will be horizontal.

<div class="vl-example" data-name="box_plot_minmax_2D_horizontal_short"></div

If the continuous field is on the y axis then the boxplot will be vertical.

<div class="vl-example" data-name="box_plot_minmax_2D_vertical_short"></div>

Since the continuous field is used for orientation, discrete x discrete and continuous x continuous do not make sense and therefore will not work.

### Boxplot with Color and/or Size

You can customize the color and size of the box in the `box-plot` by using the `color` and `size` [encoding channels](encoding.html#channels).

<div class="vl-example" data-name="box_plot_minmax_2D_vertical_short"></div>

### Boxplot Config

You can specify the size of the box in the config using:

{: .suppress-error}
```json
{"config": {"box": {"size": ...}}}
```

For futher config customization we must look at what the short 2D `box-plot` example shown in Boxplot with Color and/or Size section is expanded to:

<div class="vl-example" data-name="box_plot_minmax_2D_vertical_full"></div>

There are three roles: `box`, `boxWhisker`, `boxMid`. Therefore as you have seen from specifying the size of the box you can specify [mark](mark.html) properties in config.

{: .suppress-error}
```json
{
  "config": {
    "box": ...,
    "boxWhiskers": ...,
    "boxMid": ...
  }
}
```

**Note**: `box` can specify `size` in addition to `color` and `opacity` which `boxWhisker` and `boxMid` can specify.

### Boxplot Orientation
`box-plot` orientation is determined by the continuous field axis. If the continuous field is on the x axis then the `box-plot` has a horizontal orientation. If the continuous field is on the y axis then the `box-plot` has a vertical orientation. In the case where both the x and y axis have continuous fields, the axis with a specified aggregate property of `box-plot` determines the orientation. So, if the x axis has an aggregate value of `box-plot` the `box-plot` has a horizontal orientation and if the y axis has an aggregate value of `box-plot` the `box-plot` has a vertical orientation. If no aggregate value for either of the axes is specified, an orient property must be specified in the mark object. For example the following `mark` example specifies a vertical `box-plot`.

{: .suppress-error}
```json
"mark": {
  "type": "box-plot",
  "orient": "vertical"
}
```

In the case an aggregate value of `box-plot` in one of the axes is not specified and an orient property is not specified the default orientation of vertical is used.

### Boxplot Types
There are two supported types of boxplots which you specify with the extent property in the mark definition:
1) `min-max boxplot` which is a boxplot where lower and upper whiskers are defined as the min and max respectively
{: .suppress-error}
```json
"mark": {
  "type": "box-plot",
  "extent": "min-max"
}
```
2) `k * IQR boxplot` which is a boxplot where the lower whisker is defined as the first quartile minus k * IQR (q1 - k * IQR) and the upper whisker is defined as the third quartile plus k * IQR (q3 + k * IQR). In this type of boxplot you are able to specify the constant or scalar k which is typically 1.5. IQR is the interquartile range which is quartile 3 minus quartile 1.
```json
"mark": {
  "type": "box-plot",
  "extent": 1.5
}
```

If the extent is not specified then the default `box-plot` type of `min-max` is used.
