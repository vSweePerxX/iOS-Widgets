// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: shopping-cart;
// Version 1.0.1

const cacheMinutes = 60 * 2
const today = new Date()
let width
const h = 5
const debug = false

if (config.widgetFamily === 'small') {
  width = 100
} else {
  width = 200
}

////////////////////////////////////////////////////////////
let widgetInputRAW = args.widgetParameter;
let widgetInput;
if (widgetInputRAW !== null) {
  widgetInput = widgetInputRAW.toString().trim().split(';')

  if (widgetInput[2] && !/^[\d]+$/.test(widgetInput[2])) {
    throw new Error('Third parameter has to be a number')
  }
} else {
  throw new Error('No Ordernumber and E-Mail address set')
}
////////////////////////////////////////////////////////////
const files = FileManager.local()

const path = files.joinPath(files.cacheDirectory(), "widget-apple-store-order")

const cacheExists = files.fileExists(path)

const cacheDate = cacheExists ? files.modificationDate(path) : 0
////////////////////////////////////////////////////////////
const localeText = {
  default: ['Day', 'Days'],
  en: ['Day', 'Days'],
  de: ['Tag', 'Tage'],
  fr: ['Jour', 'Jours'],
  es: ['día', 'días'],
  it: ['giorno', 'giorni']
}
////////////////////////////////////////////////////////////
const parseLongDate = (stringDate) => {
  const months = {
    'January': 0,
    'February': 1,
    'March': 2,
    'April': 3,
    'May': 4,
    'June': 5,
    'July': 6,
    'August': 7,
    'September': 8,
    'October': 9,
    'November': 10,
    'December': 11
  }
  const m = stringDate.match(/([\w]+)[\s]([\d]{1,2}),[\s]([0-9]{4})/)
  return new Date(m[3], months[m[1]], m[2])
}
const parseShortDate = (stringDate, orderMonth) => {
  const months = {
    'Jan': 0,
    'Feb': 1,
    'Mar': 2,
    'Apr': 3,
    'May': 4,
    'Jun': 5,
    'Jul': 6,
    'Aug': 7,
    'Sep': 8,
    'Oct': 9,
    'Nov': 10,
    'Dec': 11
  }
  const m = stringDate.match(/([\d]{1,2}) ([\w]{3})/)
  let year = new Date().getFullYear()
  if (months[m[2]] < orderMonth) {
    year += 1
  }
  return new Date(year, months[m[2]], m[1])
}
////////////////////////////////////////////////////////////
function creatProgress(total, havegone) {
  const context = new DrawContext()
  context.size = new Size(width, h)
  context.opaque = false
  context.respectScreenScale = true
  context.setFillColor(new Color('#d2d2d7'))
  const path = new Path()
  path.addRoundedRect(new Rect(0, 0, width, h), 3, 2)
  context.addPath(path)
  context.fillPath()
  context.setFillColor(new Color('#008009'))
  const path1 = new Path()
  const path1width = (width * havegone / total > width) ? width : width * havegone / total
  path1.addRoundedRect(new Rect(0, 0, path1width, h), 3, 2)
  context.addPath(path1)
  context.fillPath()
  return context.getImage()
}
////////////////////////////////////////////////////////////
const getTimeRemaining = function (endtime) {
  const total = Date.parse(endtime) - Date.parse(new Date());
  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));

  return {
    total,
    days,
    hours,
    minutes,
    seconds
  };
}
////////////////////////////////////////////////////////////
const getOrderdetails = async (ordernumber, email) => {
  const reqSession = new Request('https://secure.store.apple.com/shop/order/list')
  resSession = await reqSession.loadString()

  const CookieValues = reqSession.response.cookies.map((v) => {
    return v.name + "=" + v.value
  })

  const xAosStkMatch = resSession.match(/"x-aos-stk":"([\w]+)"/)
  if (!xAosStkMatch) {
    throw new Error('Needed x-aos-stk token not found')
  }

  const postUrl = (reqSession.response.url.replace('/np/', '/npx/')) + '&_a=guestUserOrderLookUp&_m=loginHomeOLSS.orderLookUp'

  const postReq = new Request(postUrl)
  postReq.headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': reqSession.response.url,
    'x-aos-model-page': 'sentryLoginOlssNP',
    'x-aos-stk': xAosStkMatch[1],
    'X-Requested-With': 'XMLHttpRequest',
    'Cookie': CookieValues.join('; ')
  }
  postReq.method = "POST";
  postReq.addParameterToMultipart('loginHomeOLSS.orderLookUp.orderNumber', ordernumber)
  postReq.addParameterToMultipart('loginHomeOLSS.orderLookUp.emailAddress', email)

  const resPostReq = await postReq.loadString()

  if (postReq.response.statusCode !== 200) {
    throw new Error(`Got HTTP ${postReq.response.statusCode} from API.`)
  }

  let postResData
  try {
    postResData = JSON.parse(resPostReq)
  } catch (e) {
    throw new Error('Can\'t parse API response.')
  }

  if (postResData['head']['status'] !== 302) {
    console.log(resPostReq)
    throw new Error('Fetching the data failed. Got unexpected response. Please try it later.')
  }

  const req = new Request(postResData['head']['data']['url'])
  const res = await req.loadString()
  const rawJSON = res.match(/<script id="init_data" type="application\/json">(.*)<\/script>/)
  if (!rawJSON) {
    return null
  }
  const data = JSON.parse(rawJSON[1])
  if (!data['orderDetail']) {
    console.log(data)
    throw new Error('no orderDetail attribute')
  }
  return data
}
////////////////////////////////////////////////////////////
let orderDetails
if (cacheExists && (today.getTime() - cacheDate.getTime()) < (cacheMinutes * 60 * 1000)) {
  console.log("Get from Cache")
  orderDetails = JSON.parse(files.readString(path))
} else {
  console.log("Get from Website")
  try {
    orderDetails = await getOrderdetails(widgetInput[0], widgetInput[1])
    if (orderDetails !== null) {
      console.log("Write to Cache")
      files.writeString(path, JSON.stringify(orderDetails))
    }
  } catch (e) {
    console.error('Fetching data from website failed:')
    console.error(e)
    if (cacheExists) {
      console.warn('Fallback to Cache')
      orderDetails = JSON.parse(files.readString(path))
    } else {
      throw new Error('Fetching the data failed. Now data to show.')
    }
  }
}
if (debug) {
  console.log(JSON.stringify(orderDetails, null, 2))
}

let widget = new ListWidget();

if (!orderDetails) {
  widget.addText('No order found')
} else {
  if (widgetInput[2] && !orderDetails['orderDetail']['orderItems']['c'][widgetInput[2] - 1]) {
    throw new Error(`No Item on position ${widgetInput[2]}`)
  }

  const itemPosition = orderDetails['orderDetail']['orderItems']['c'][(widgetInput[2] - 1) || 0]
  const itemDetails = orderDetails['orderDetail']['orderItems'][itemPosition]['orderItemDetails']
  const orderDate = parseLongDate(orderDetails['orderDetail']['orderHeader']['d']['orderPlacedDate'])
  const deliveryDate = parseShortDate(itemDetails['d']['deliveryDate'], orderDate.getMonth())
  const itemName = itemDetails['d']['productName']
  const itemImageUrl = itemDetails['d']['imageData']['src'].replace(/wid=[\d]+/, 'wid=200').replace(/hei=[\d]+/, 'hei=200')
  const itemImage = await(new Request(itemImageUrl)).loadImage()
  const remainingDays = getTimeRemaining(deliveryDate).days + 1;

  widget.setPadding(10, 10, 10, 10)
  widget.backgroundColor = Color.white()
  widget.url = `https://store.apple.com/xc/de/vieworder/${widgetInput[0]}/${widgetInput[1]}`

  const headlineText = widget.addText(' Order Status')
  headlineText.font = Font.regularSystemFont(14)
  headlineText.textColor = Color.black()

  widget.addSpacer()

  const productStack = widget.addStack()
  productStack.layoutHorizontally()

  itemImageElement = productStack.addImage(itemImage)
  itemImageElement.imageSize = new Size(30, 30)

  productStack.addSpacer(10)

  const itemNameText = productStack.addText(itemName)
  itemNameText.font = Font.regularSystemFont(16)
  itemNameText.textColor = Color.black()
  itemNameText.minimumScaleFactor = 0.3
  itemNameText.lineLimit = 2

  widget.addSpacer()

  const languageCode = Device.language().match(/^[\a-z]{2}/)
  const t = (localeText[languageCode]) ? localeText[languageCode] : localeText.default
  let postFix = (remainingDays === 1) ? t[0] : t[1]

  const remainingDayText = widget.addText(remainingDays + ' ' + postFix)
  remainingDayText.font = Font.regularSystemFont(28)
  remainingDayText.textColor = Color.black()
  remainingDayText.centerAlignText()

  widget.addSpacer()

  const total = (deliveryDate - orderDate) / (1000 * 60 * 60 * 24)
  const daysGone = total - remainingDays

  widget.addImage(creatProgress(total, daysGone))

  widget.addSpacer(5)

  const footerStack = widget.addStack()
  footerStack.layoutHorizontally()

  const orderDateText = footerStack.addDate(orderDate)
  orderDateText.textColor = Color.black()
  orderDateText.font = Font.regularSystemFont(8)

  footerStack.addSpacer()

  const deliveryDateText = footerStack.addDate(deliveryDate)
  deliveryDateText.textColor = Color.black()
  deliveryDateText.font = Font.regularSystemFont(8)
}

if (!config.runsInWidget) {
  await widget.presentSmall()
} else {
  // Tell the system to show the widget.
  Script.setWidget(widget)
  Script.complete()
}
