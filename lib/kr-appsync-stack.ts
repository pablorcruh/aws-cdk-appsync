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

export class KrAppsyncStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


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


    const indicatorPerAreaResolver: CfnResolver = new CfnResolver(
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
    );

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

    indicatorPerAreaResolver.addDependsOn(apiSchema);
    classificationSummaryResolver.addDependsOn(apiSchema);

  }
}
