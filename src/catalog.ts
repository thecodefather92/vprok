import { launch } from 'puppeteer'
import { writeFile } from 'fs/promises'

declare global {
    interface Catalog {
        products: Product[]
    }
    interface Product {
        url: string
        name: string
        rating: number
        reviews: number
        price: number
        oldPrice: number
        discount: number
    }
}

;(async () => {
    const url = process.argv[2]
    
    const browser = await launch({
        headless: false,
        devtools: true
    })
    const [page] = await browser.pages()

    await page.setRequestInterception(true)
    page.on('request', req => req.continue())

    await page.goto('https://www.vprok.ru/', {
        waitUntil: 'networkidle2'
    })

    await page.waitForFunction('window.__NEXT_DATA__.props.pageProps')
    const data = await page.evaluate((url: string) => {
        return new Promise<Catalog>(ok => {
            const uObj = new URL(url)
            const path = uObj.pathname
            const cId = path.split('catalog/')[1].split('/')[0]
            fetch(`/web/api/v1/catalog/category/${cId}?sort=popularity_desc&limit=30&page=1`, {
                body: JSON.stringify({url:path}),
                method: 'POST',
                credentials: 'include'
            })
                .then(r => r.json())
                .then(r => ok(r))
        })
    }, url)
    const fLines = []
    for(let i = 0; i < data.products.length; ++i) {
        const item = data.products[i]
        fLines.push([
            `Название товара: ${item.name}`,
            `Ссылка на страницу товара: https://www.vprok.ru${item.url}`,
            `Рейтинг: ${item.rating}`,
            `Количество отзывов: ${item.reviews}`,
            `Цена: ${item.price}`,
            item.oldPrice ? `Акционная цена: ${item.price}` : undefined,
            item.oldPrice ? `Цена до акции: ${item.oldPrice}` : undefined,
            item.discount ? `Размер скидки: ${item.discount}`: undefined
        ].filter(item => item).join("\r\n"))
    }
    await writeFile('products-api.txt', fLines.join("\r\n\r\n"))
    await browser.close()
})()