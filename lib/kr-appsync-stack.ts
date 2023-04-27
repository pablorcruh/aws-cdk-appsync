import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { readFileSync } from "fs";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import {
  CfnGraphQLApi,
  CfnGraphQLSchema,
  CfnDataSource,
  CfnResolver,
} from "aws-cdk-lib/aws-appsync";
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
export class KrAppsyncStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const domainsTable = new dynamodb.Table(this, 'krDomainsTable', {
      partitionKey: {
        name: 'domain_name',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'enterprise_id',
        type: dynamodb.AttributeType.STRING,
      },
      tableName: 'krDomainsTable',
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

  

    
/*     const openSearchDomain = 'https://search-bitmap-solutions-4yi3533owyvxnzjky3zet5h5au.us-east-1.es.amazonaws.com';
    const myExistingDomain = opensearch.Domain.fromDomainEndpoint(
      this, 'myExistingDomain', openSearchDomain);  */

    const cloudWatchRole = new Role(this, "appSyncCloudWatchLogs", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });

    cloudWatchRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSAppSyncPushToCloudWatchLogs"
      )
    );

    const dynamoDBRole = new Role(this, "DynamoDBRole", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });

   const openSearchRole = new Role(this, "OpenSearchDataSourceRole",{
      inlinePolicies: {
        'openSearchPolicy': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'es:ESHttpGet',
                'es:ESHttpHead',
              ],
              resources: [
                'arn:aws:es:us-east-1:634522811166:domain/bitmap-solutions',
              ],
            }),
          ],
        })
      },
      assumedBy: new ServicePrincipal("appsync.amazonaws.com")
    })

    dynamoDBRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess")
    );



    const graphAPI = new CfnGraphQLApi(this, "graphqlApi", {
      name: "sample-pipeline",
      authenticationType: "API_KEY",
      
      logConfig: {
        fieldLogLevel: "ALL",
        cloudWatchLogsRoleArn: cloudWatchRole.roleArn,
      },
      xrayEnabled: false,
    });

    const apiSchema = new CfnGraphQLSchema(this, "GraphqlApiSchema", {
      apiId: graphAPI.attrApiId,
      definition: readFileSync("./lib/graphql/schema.graphql").toString(),
    });

    const summary = Table.fromTableName(this,'KrAgentCountersResume', 'kr-agents-counters-resume');

    /* const openSearchDataSource = new appsync.CfnDataSource(this, 'OpenSearchDataSource', {
      apiId: graphAPI.attrApiId,
      name: 'OpenSearchDataSource',
      type: 'AMAZON_ELASTICSEARCH',
      elasticsearchConfig: {
        awsRegion: myExistingDomain.env.region,
        endpoint: openSearchDomain
      },
      serviceRoleArn: openSearchRole.roleArn
    }); */


    const domainsTableDatasource: CfnDataSource = new CfnDataSource(
      this,
      "KrDomainsTableDataSource",
      {
        apiId: graphAPI.attrApiId,
        name: "KrDomainsTableDataSource",
        type: "AMAZON_DYNAMODB",
        dynamoDbConfig: {
          tableName: domainsTable.tableName,
          awsRegion: this.region,
        },
        serviceRoleArn: dynamoDBRole.roleArn,
      }
    );


    const summaryTableDatasource: CfnDataSource = new CfnDataSource(
      this,
      "KrAgentCountersResumeTableDataSource",
      {
        apiId: graphAPI.attrApiId,
        name: "KrAgentCountersResumeTableDataSource",
        type: "AMAZON_DYNAMODB",
        dynamoDbConfig: {
          tableName: summary.tableName,
          awsRegion: this.region,
        },
        serviceRoleArn: dynamoDBRole.roleArn,
      }
    );

    


    /* const indicatorPerAreaResolver: CfnResolver = new CfnResolver(
      this,
      "indicatorPerAreaResolver",
      {
        apiId: graphAPI.attrApiId,
        typeName: "Query",
        fieldName: "getIndicatorPerArea",
        dataSourceName: openSearchDataSource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.indicatorPerArea.req.vtl"
        ).toString(),

        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.indicatorPerArea.res.vtl"
        ).toString(),
      }
    ); */
   


   /*  const indicatorPerAreaResolver: CfnResolver = new CfnResolver(
      this,
      "indicatorPerAreaResolver",
      {
        apiId: graphAPI.attrApiId,
        typeName: "Query",
        fieldName: "getIndicatorPerArea",
        dataSourceName: summaryTableDatasource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.indicatorPerArea.req.vtl"
        ).toString(),

        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.indicatorPerArea.res.vtl"
        ).toString(),
      }
    ); */

    const classificationSummaryResolver: CfnResolver = new CfnResolver(
      this,
      "classificationSummaryResolver",
      {
        apiId: graphAPI.attrApiId,
        typeName: "Query",
        fieldName: "getClassificationSummary",
        dataSourceName: summaryTableDatasource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.classificationSummary.req.vtl"
        ).toString(),

        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.classificationSummary.res.vtl"
        ).toString(),
      }
    );


    const domainNamesResolver: CfnResolver = new CfnResolver(
      this,
      "domainNamesResolver",
      {
        apiId: graphAPI.attrApiId,
        typeName: "Query",
        fieldName: "getDomainVerification",
        dataSourceName: domainsTableDatasource.name,
        requestMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.DomainValidation.req.vtl"
        ).toString(),

        responseMappingTemplate: readFileSync(
          "./lib/graphql/mappingTemplates/Query.DomainValidation.res.vtl"
        ).toString(),
      }
    );

    classificationSummaryResolver.addDependsOn(apiSchema);
    domainNamesResolver.addDependsOn(apiSchema);

    
    //indicatorPerAreaResolver.addDependsOn(openSearchDataSource);
    

    /* const handler = new lambda.Function(this, 'Handler', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
    });


    const recaptchaLambdaResolver: CfnResolver = new CfnResolver(
      this,
      "classificationSummaryResolver",
      {
        apiId: graphAPI.attrApiId,
        typeName: "Mutation",
        fieldName: "validateRecaptcha",

        requestMappingTemplate: readFileSync(
          "./lib/http/mappingTemplates/Invoke.recaptchaValidator.req.vtl"
        ).toString(),
        responseMappingTemplate: readFileSync(
          "./lib/http/mappingTemplates/Invoke.recaptchaValidator.res.vtl"
        ).toString(),
      }
    ); */

  }
}
