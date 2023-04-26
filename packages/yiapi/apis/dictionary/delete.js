import { fnSchema, fnApiInfo } from '../../utils/index.js';

import { mapTableConfig } from '../../config/mapTable.js';
import { constantConfig } from '../../config/constant.js';
import { schemaConfig } from '../../config/schema.js';
import { metaConfig } from './_meta.js';

const apiInfo = await fnApiInfo(import.meta.url);

export const apiSchema = {
    tags: [apiInfo.parentDirName],
    summary: `删除${metaConfig.name}`,
    body: {
        title: `删除${metaConfig.name}接口`,
        type: 'object',
        properties: {
            id: fnSchema(schemaConfig.id, '唯一ID')
        },
        required: ['id']
    }
};

export default async function (fastify, opts) {
    fastify.route({
        method: 'POST',
        url: `/${apiInfo.pureFileName}`,
        schema: apiSchema,
        config: {
            isLogin: true
        },
        handler: async function (req, res) {
            try {
                let dictionaryModel = fastify.mysql //
                    .table(mapTableConfig.sys_dictionary)
                    .where({ id: req.body.id });

                let dictionaryData = await dictionaryModel.clone().first();

                if (dictionaryData.is_system === 1) {
                    return {
                        ...constantConfig.code.DELETE_FAIL,
                        msg: '默认字典，无法删除'
                    };
                }

                let result = await dictionaryModel.clone().delete();
                return {
                    ...constantConfig.code.DELETE_SUCCESS,
                    data: result
                };
            } catch (err) {
                fastify.log.error(err);
                return constantConfig.code.DELETE_FAIL;
            }
        }
    });
}
