import {Construct} from "constructs";
import {App, TerraformOutput, TerraformStack} from "cdktf";
import {LambdaFunction} from "@cdktf/provider-aws/lib/lambda-function";
import {DataAwsIamPolicyDocument} from "@cdktf/provider-aws/lib/data-aws-iam-policy-document";
import {IamRole} from "@cdktf/provider-aws/lib/iam-role";
import {DataArchiveFile} from "@cdktf/provider-archive/lib/data-archive-file";
import {AwsProvider} from "@cdktf/provider-aws/lib/provider";
import {ArchiveProvider} from "@cdktf/provider-archive/lib/provider";
import * as path from "path";
import {LambdaFunctionUrl} from "@cdktf/provider-aws/lib/lambda-function-url";
import {IamRolePolicy} from "@cdktf/provider-aws/lib/iam-role-policy";

class MainStack extends TerraformStack {
    private prefix = 'dale-test-';
    private region = 'eu-west-2'
    private accountId = '<account-id>';
    constructor(scope: Construct, id: string) {
        super(scope, id);

        new ArchiveProvider(this, "archiveProvider");
        new AwsProvider(this, this.prefix + "aws", {
            region: this.region,
            allowedAccountIds: [this.accountId],
            defaultTags: [
                {
                    tags: {
                        name: this.prefix +'lambda-stack',
                        version: "1.0",

                   /*     app: "cicd",
                        squad: "ps",
                        project: "platform",
                        managedBy: "platform-engineering/terraform/ec2-runners",
                        environment: 'sandbox',
                        publicFacing: "no",
                        status: "ok",
                        classification: "confidential",*/
                    }
                }
            ]
        });

        const role = this.rolesAndPermissions();

        const archiveFile = new DataArchiveFile(this, this.prefix +"lambda", {
            outputPath: "lambda_function_payload.zip",
            sourceDir: path.resolve(__dirname, "dist"),
            type: "zip",
        });

        const lambda = new LambdaFunction(this, this.prefix +"test_lambda", {
            environment: {
                variables: {
                    foo: "bar",
                },
            },
            filename: "lambda_function_payload.zip",
            functionName: "dale_test_auto",
            handler: "index.handler",
            role: role.arn,
            runtime: "nodejs16.x",
            sourceCodeHash: archiveFile.outputBase64Sha256,
        });

        const url = new LambdaFunctionUrl(this, this.prefix +'lambda-url', {
            functionName: lambda.functionName,
            authorizationType: 'NONE'
        });

        const debugOutput = new TerraformOutput(this, "lambda-function", {
            value: url,
        });

        console.log(debugOutput);
    }

    private rolesAndPermissions() {
        const role = new IamRole(this, this.prefix + "iam_for_lambda", {
            assumeRolePolicy: new DataAwsIamPolicyDocument(this, this.prefix + "assume_role", {
                statement: [
                    {
                        actions: [
                            "sts:AssumeRole"
                        ],
                        effect: "Allow",
                        principals: [
                            {
                                identifiers: ["lambda.amazonaws.com"],
                                type: "Service",
                            },
                        ],
                    }
                ],
            }).json,
            name: this.prefix + "iam_for_lambda",
        });

        new IamRolePolicy(this, this.prefix + "iamPolicy", {
            name: this.prefix + `iamPolicy-state`,
            role: role.id,
            policy: new DataAwsIamPolicyDocument(this, this.prefix + "iamPolicyDoc", {
                version: "2012-10-17",
                statement: [
                    {
                        effect: "Allow",
                        actions: ["logs:CreateLogGroup"],
                        resources: [`arn:aws:logs:${this.region}:${this.accountId}:*`]
                    },
                    {
                        effect: "Allow",
                        actions: [
                            "logs:CreateLogStream",
                            "logs:PutLogEvents"
                        ],
                        resources: [
                            `arn:aws:logs:${this.region}:${this.accountId}:log-group:/aws/lambda/dale-test-manual:*`
                        ]
                    }
                ]
            }).json
        });
        return role;
    }
}

const app = new App();
new MainStack(app, "lambda");
app.synth();
