import * as yiapi from '@yicode/yiapi';

const apiInfo = await yiapi.utils.fnApiInfo(import.meta.url);

export const apiSchema = {
    summary: `添加资讯`,
    tags: [apiInfo.parentDirName],
    description: `${apiInfo.apiPath}`,
    body: {
        type: 'object',
        title: '添加资讯接口',
        properties: {
            category_id: yiapi.utils.fnSchema(yiapi.schemaField.id, '资讯分类'),
            title: yiapi.utils.fnSchema(yiapi.schemaField.title, '资讯标题'),
            describe: yiapi.utils.fnSchema(yiapi.schemaField.string0to500, '资讯描述'),
            thumbnail: yiapi.utils.fnSchema(yiapi.schemaField.image, '资讯缩略图'),
            content: yiapi.utils.fnSchema(yiapi.schemaField.content, '资讯正文')
        },
        required: [
            //
            'category_id',
            'title'
        ]
    }
};

export default async function (fastify) {
    fastify.post(`/${apiInfo.pureFileName}`, {
        schema: apiSchema,
        config: {},
        handler: async function (req, res) {
            const trx = await fastify.mysql.transaction();
            try {
                let newsModel = trx.table('news');

                let insertData = {
                    category_id: req.body.category_id,
                    title: req.body.title,
                    describe: req.body.describe,
                    thumbnail: req.body.thumbnail,
                    content: req.body.content
                };

                let result = await newsModel.clone().insert(yiapi.utils.fnClearInsertData(insertData));

                await trx.commit();
                return {
                    ...yiapi.appConfig.httpCode.INSERT_SUCCESS,
                    data: result
                };
            } catch (err) {
                fastify.log.error(err);
                await trx.rollback();
                return yiapi.appConfig.httpCode.INSERT_FAIL;
            }
        }
    });
}
