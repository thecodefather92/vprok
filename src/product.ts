import { launch } from 'puppeteer'
import { writeFile } from 'fs/promises'

declare global {
    interface Region {
        name: string
        regionId: number
        isBold: boolean
    }
    interface Regions {
        regionList: Region[]
    }
    interface ProductPage {
        owox: {
            reviewsRating: string
            reviewsCount: string
        }
        product: {
            price: number
            oldPrice: number
        }
    }
    interface Window {
        __NEXT_DATA__: {
            buildId: string
            props: {
                pageProps: {
                    initialStore: {
                        productPage: ProductPage
                    }
                }
            }
        }
    }
}


; (async () => {
    const qRegion = process.argv[3].toLowerCase()
    const url = process.argv[2]
    const browser = await launch({
        headless: false,
        devtools: false,
    })

    const [page] = await browser.pages()

    await page.setViewport({
        width: 1024,
        height: 768
    })
    await page.setRequestInterception(true)
    page.on('request', req => req.continue())

    await page.goto('https://www.vprok.ru/')
    let region: Region = null
    const waitForNavigation = page.waitForNavigation({
        waitUntil: 'networkidle2'
    })
    for (let i = 0; i < 2; ++i) {
        try {
            const regions: Regions = await (await page.waitForResponse(res => res.url().includes('/web/api/v1/regionList'))).json()
            console.log(regions)
            region = regions.regionList.find(item => item.name.toLowerCase().includes(qRegion))
            if (!region)
                throw new Error(`Регион ${qRegion} не найден`)
            break;
        } catch(e) {  }
    }
    if (!region)
        throw new Error('Не удалось получить список регионов')

    console.dir(region)
    await waitForNavigation
    await page.evaluate(() => cookieStore.set({
        "domain": "vprok.ru",
        "expires": 1801605759000,
        "name": "loyaltyOnboardingStatus",
        "partitioned": false,
        "path": "/",
        "sameSite": "lax",
        "value": "onboardingShown"
    }))
    await page.evaluate(() => cookieStore.set({
        "domain": "vprok.ru",
        "expires": 1801602708888.267,
        "name": "isUserAgreeCookiesPolicy",
        "partitioned": false,
        "path": "/",
        "sameSite": "lax",
        "value": "true"
    }))
    await page.evaluate((region: Region) => new Promise<void>((ok) => {
        cookieStore.set('regionChange', '1')
            .then(() => cookieStore.get('region'))
            .then((r: any) => {
                r.value = region.regionId.toString()
                return cookieStore.set(r)
            })
            .then(() => cookieStore.get('XSRF-TOKEN'))
            .then(v => {
                const token = v.value
                return fetch('/web/api/v1/changeRegion', {
                    headers: {
                        'content-type': 'application/json',
                        'x-xsrf-token': token
                    },
                    body: JSON.stringify(region),
                    method: 'POST',
                    credentials: 'include'
                })
            })
            .then(r => r.text())
            .then(r => { ok() })
    }), region);

    await page.goto(url, {
        waitUntil: 'networkidle2'
    })

    await page.waitForSelector('h1')
    await new Promise(ok => setTimeout(ok, 5000))
    await page.screenshot({
        fullPage: true,
        type: 'jpeg',
        path: './screenshot.jpg'
    })

    const data = await page.evaluate(() => new Promise<ProductPage>(ok => ok(window.__NEXT_DATA__.props.pageProps.initialStore.productPage)))

    const rObj = {
        price: data.product.price,
        priceOld: data.product.oldPrice,
        rating: data.owox.reviewsRating,
        reviewCount: data.owox.reviewsCount
    }
    let fContent = ''
    for (const key in rObj) {
        fContent += `${key}=${rObj[key]}\r\n`
    }
    await writeFile('product.txt', fContent)
    console.log(fContent)
    await browser.close()
})()